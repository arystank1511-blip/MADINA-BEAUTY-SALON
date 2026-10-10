import { Injectable } from '@nestjs/common';
import { Db } from './db';
import { config } from './config';
import { salonDate } from './availability/rules';

/** Comparable phone key: the last 10 digits, so +7 777…, 8 777… and 777… match. */
export const phoneKey = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

/** Client cards built from visits (grouped by phone) plus the salon's own notes. */
@Injectable()
export class Clients {
  constructor(private db: Db) {}
  /** Visit ids whose phone has this key; done in SQL so formats like «8 (777) …» match. */
  private async visitIds(phone: string) {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Appointment"
      WHERE right(regexp_replace(coalesce("guestPhone", ''), '\\D', '', 'g'), 10) = ${phone}`;
    return rows.map((r) => r.id);
  }
  async list(q = '', now = new Date()) {
    const [visits, cards] = await Promise.all([
      this.db.appointment.findMany({
        where: { guestPhone: { not: null } },
        select: {
          guestName: true,
          guestPhone: true,
          status: true,
          startsAt: true,
          holdUntil: true,
          priceMinor: true,
          paidMinor: true,
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.db.client.findMany(),
    ]);
    const notes = new Map(cards.map((c) => [c.phone, c]));
    const people = new Map<
      string,
      {
        phone: string;
        name: string;
        displayPhone: string;
        visits: number;
        noShows: number;
        spentMinor: number;
        lastVisit: Date | null;
        nextVisit: Date | null;
      }
    >();
    for (const v of visits) {
      const key = phoneKey(v.guestPhone);
      if (!key) continue;
      const p = people.get(key) || {
        phone: key,
        name: '',
        displayPhone: v.guestPhone || '',
        visits: 0,
        noShows: 0,
        spentMinor: 0,
        lastVisit: null,
        nextVisit: null,
      };
      if (v.guestName) p.name = v.guestName;
      p.displayPhone = v.guestPhone || p.displayPhone;
      if (v.status === 'COMPLETED') {
        p.visits++;
        p.spentMinor += v.paidMinor ?? v.priceMinor;
        p.lastVisit = v.startsAt;
      } else if (v.status === 'NO_SHOW') p.noShows++;
      else if (
        v.startsAt > now &&
        (v.status === 'CONFIRMED' || (v.status === 'PENDING' && v.holdUntil && v.holdUntil > now))
      )
        p.nextVisit ??= v.startsAt;
      people.set(key, p);
    }
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, '');
    return [...people.values()]
      .map((p) => {
        const c = notes.get(p.phone);
        return { ...p, note: c?.note ?? '', birthday: c?.birthday ?? null, blocked: !!c?.blocked };
      })
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          (digits.length >= 3 && p.phone.includes(digits.slice(-10))),
      )
      .sort(
        (a, b) =>
          +(b.nextVisit || b.lastVisit || 0) - +(a.nextVisit || a.lastVisit || 0) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 300);
  }
  async card(phone: string) {
    const [ids, saved] = await Promise.all([
      this.visitIds(phone),
      this.db.client.findUnique({ where: { phone } }),
    ]);
    const history = await this.db.appointment.findMany({
      where: { id: { in: ids } },
      include: { master: { select: { name: true } } },
      orderBy: { startsAt: 'desc' },
      take: 200,
    });
    return {
      phone,
      name: history.find((h) => h.guestName)?.guestName ?? '',
      displayPhone: history[0]?.guestPhone ?? phone,
      note: saved?.note ?? '',
      birthday: saved?.birthday ?? null,
      blocked: !!saved?.blocked,
      history,
    };
  }
  save(phone: string, data: { note: string; birthday?: string | null; blocked: boolean }) {
    const value = { note: data.note, birthday: data.birthday || null, blocked: data.blocked };
    return this.db.client.upsert({
      where: { phone },
      create: { phone, ...value },
      update: value,
    });
  }
  /** Notes for the phones of a day, so the master sees them on each visit. */
  async forPhones(phones: (string | null)[]) {
    const keys = [...new Set(phones.map(phoneKey).filter(Boolean))];
    if (!keys.length) return {};
    const rows = await this.db.client.findMany({ where: { phone: { in: keys } } });
    return Object.fromEntries(
      rows.map((c) => [c.phone, { note: c.note, birthday: c.birthday, blocked: c.blocked }]),
    );
  }
  async isBlocked(phone: string) {
    const key = phoneKey(phone);
    return !!key && !!(await this.db.client.findFirst({ where: { phone: key, blocked: true } }));
  }
  /** Remembers a birthday given on the site, without overwriting one the salon entered. */
  async rememberBirthday(phone: string, birthday: string) {
    const key = phoneKey(phone);
    if (!key) return;
    await this.db.client.upsert({
      where: { phone: key },
      create: { phone: key, birthday },
      update: {},
    });
    await this.db.client.updateMany({ where: { phone: key, birthday: null }, data: { birthday } });
  }
  /** Clients whose birthday is today (salon time) and who were not greeted this year. */
  async birthdaysToday(now = new Date()) {
    const date = salonDate(now, config.timezone);
    const year = Number(date.slice(0, 4));
    const rows = await this.db.client.findMany({
      where: {
        birthday: date.slice(5),
        blocked: false,
        OR: [{ greetedYear: null }, { greetedYear: { lt: year } }],
      },
    });
    const result = [];
    for (const c of rows) {
      const ids = await this.visitIds(c.phone);
      const last = await this.db.appointment.findFirst({
        where: { id: { in: ids } },
        orderBy: { startsAt: 'desc' },
        select: { guestName: true, guestPhone: true },
      });
      result.push({
        phone: c.phone,
        name: last?.guestName ?? '',
        displayPhone: last?.guestPhone ?? c.phone,
      });
    }
    return result;
  }
  async ungreet(phone: string) {
    await this.db.client.updateMany({ where: { phone }, data: { greetedYear: null } });
  }
  async greeted(phone: string, now = new Date()) {
    const year = Number(salonDate(now, config.timezone).slice(0, 4));
    await this.db.client.updateMany({ where: { phone }, data: { greetedYear: year } });
  }
}
