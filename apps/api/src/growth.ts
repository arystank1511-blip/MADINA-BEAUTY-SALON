import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { config } from './config';
import { activeAt } from './booking/booking.service';
import { WhatsApp } from './whatsapp';

export interface GrowthSettings {
  /** Where clients leave a review: the salon's 2GIS card by default. */
  reviewUrl: string;
  /** Weeks after the latest visit when a client is invited back. */
  returnWeeks: number;
}
const KEY = 'growth';
const DAY = 86400000;
/** A review is asked for 2 hours after the visit ends, and at most once in 90 days per client. */
const REVIEW_AFTER = 2 * 3600000;
const REVIEW_EVERY = 90 * DAY;
/** Comparable phone key: the last 10 digits, so +7 777…, 8 777… and 777… match. */
const key = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};
const visit = {
  id: true,
  guestName: true,
  guestPhone: true,
  serviceName: true,
  startsAt: true,
  endsAt: true,
  status: true,
  reviewRequestedAt: true,
  invitedAt: true,
} satisfies Prisma.AppointmentSelect;
export type GrowthVisit = Prisma.AppointmentGetPayload<{ select: typeof visit }>;

/** Bringing clients back: review requests after a visit and «пора подстричься» invitations. */
@Injectable()
export class Growth {
  constructor(
    private db: Db,
    private whatsapp: WhatsApp,
  ) {}
  async settings(): Promise<GrowthSettings> {
    const row = await this.db.setting.findUnique({ where: { key: KEY } });
    return {
      reviewUrl: config.map,
      returnWeeks: 5,
      ...((row?.value as Partial<GrowthSettings> | null) ?? {}),
    };
  }
  async save(settings: GrowthSettings) {
    const value = settings as unknown as Prisma.InputJsonObject;
    await this.db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    return this.settings();
  }
  reviewText(name: string | null, url: string) {
    return [
      `Здравствуйте${name ? ', ' + name : ''}!`,
      `Спасибо, что были у нас в «${config.name}».`,
      `Будем очень рады вашему отзыву — это займёт минуту: ${url}`,
    ].join('\n');
  }
  returnText(name: string | null) {
    return [
      `Здравствуйте${name ? ', ' + name : ''}!`,
      `Давно вас не видели в «${config.name}» — пора обновить стрижку?`,
      `Записаться на удобное время: ${config.siteUrl}/book`,
      'Ждём вас!',
    ].join('\n');
  }
  /** Visits that ended 2 h – 7 days ago whose client was not asked for a review recently. */
  async reviewsDue(now = new Date()) {
    const [visits, asked] = await Promise.all([
      this.db.appointment.findMany({
        where: {
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          guestPhone: { not: null },
          reviewRequestedAt: null,
          endsAt: { lte: new Date(+now - REVIEW_AFTER), gte: new Date(+now - 7 * DAY) },
        },
        select: visit,
        orderBy: { endsAt: 'desc' },
      }),
      this.db.appointment.findMany({
        where: { reviewRequestedAt: { gte: new Date(+now - REVIEW_EVERY) } },
        select: { guestPhone: true },
      }),
    ]);
    const recent = new Set(asked.map((a) => key(a.guestPhone)));
    const seen = new Set<string>();
    return visits.filter((a) => {
      const k = key(a.guestPhone);
      if (!k || recent.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  /**
   * Clients whose latest completed visit was at least `returnWeeks` ago, who have nothing booked
   * and were not invited since that visit. One row per phone: their latest visit.
   */
  async returnsDue(now = new Date(), weeks?: number) {
    const w = weeks ?? (await this.settings()).returnWeeks;
    const [history, upcoming] = await Promise.all([
      this.db.appointment.findMany({
        where: {
          status: 'COMPLETED',
          guestPhone: { not: null },
          startsAt: { gte: new Date(+now - 365 * DAY) },
        },
        select: visit,
        orderBy: { startsAt: 'desc' },
      }),
      this.db.appointment.findMany({
        where: { ...activeAt(now), startsAt: { gt: now }, guestPhone: { not: null } },
        select: { guestPhone: true },
      }),
    ]);
    const booked = new Set(upcoming.map((a) => key(a.guestPhone)));
    const latest = new Map<string, GrowthVisit & { visits: number }>();
    for (const a of history) {
      const k = key(a.guestPhone);
      if (!k) continue;
      const found = latest.get(k);
      if (found) found.visits++;
      else latest.set(k, { ...a, visits: 1 });
    }
    const due = new Date(+now - w * 7 * DAY);
    return [...latest.entries()]
      .filter(([k, a]) => !booked.has(k) && !a.invitedAt && a.startsAt <= due)
      .map(([, a]) => a)
      .sort((a, b) => +b.startsAt - +a.startsAt);
  }
  /** WhatsApp Business API: sends the optional review and return templates, once each. */
  async autoSend(now = new Date()) {
    const wa = await this.whatsapp.active();
    if (!wa || (!wa.reviewTemplate && !wa.returnTemplate)) return { reviews: 0, returns: 0 };
    const settings = await this.settings();
    let reviews = 0,
      returns = 0;
    const send = async (
      a: GrowthVisit,
      field: 'reviewRequestedAt' | 'invitedAt',
      template: string,
      params: string[],
    ) => {
      const to = key(a.guestPhone) && '7' + key(a.guestPhone);
      // Claim first; release on failure so the next run tries again.
      const claimed = await this.db.appointment.updateMany({
        where: { id: a.id, [field]: null },
        data: { [field]: now },
      });
      if (!claimed.count || !to) return false;
      const result = await this.whatsapp.send(wa, to, params, template);
      if (!result.ok)
        await this.db.appointment.update({ where: { id: a.id }, data: { [field]: null } });
      return result.ok;
    };
    if (wa.reviewTemplate)
      for (const a of await this.reviewsDue(now))
        if (
          await send(a, 'reviewRequestedAt', wa.reviewTemplate, [
            a.guestName || 'уважаемый клиент',
            settings.reviewUrl,
          ])
        )
          reviews++;
    if (wa.returnTemplate)
      for (const a of await this.returnsDue(now, settings.returnWeeks))
        if (
          await send(a, 'invitedAt', wa.returnTemplate, [
            a.guestName || 'уважаемый клиент',
            `${config.siteUrl}/book`,
          ])
        )
          returns++;
    return { reviews, returns };
  }
}
