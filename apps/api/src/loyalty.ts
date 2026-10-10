import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';

export interface LoyaltySettings {
  enabled: boolean;
  /** Every N-th visit gets the reward. */
  every: number;
  /** What the client gets, e.g. «скидка 50%». */
  reward: string;
}
const KEY = 'loyalty';
const REFERRAL = 'referral';
export interface ReferralSettings {
  enabled: boolean;
  /** What both the newcomer and whoever recommended them get, e.g. «скидка 10%». */
  reward: string;
}
/** Comparable phone key: the last 10 digits, so +7 777…, 8 777… and 777… match. */
const key = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

/** «Каждый N-й визит — подарок»: visits are counted by phone from completed visits. */
@Injectable()
export class Loyalty {
  constructor(private db: Db) {}
  async settings(): Promise<LoyaltySettings> {
    const row = await this.db.setting.findUnique({ where: { key: KEY } });
    return {
      enabled: false,
      every: 6,
      reward: 'скидка 50%',
      ...((row?.value as Partial<LoyaltySettings> | null) ?? {}),
    };
  }
  async save(settings: LoyaltySettings) {
    const value = { ...settings } as unknown as Prisma.InputJsonObject;
    await this.db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    return this.settings();
  }
  /** «Приведи подругу»: off until the owner switches it on. */
  async referral(): Promise<ReferralSettings> {
    const row = await this.db.setting.findUnique({ where: { key: REFERRAL } });
    return {
      enabled: false,
      reward: 'скидка 10%',
      ...((row?.value as Partial<ReferralSettings> | null) ?? {}),
    };
  }
  async saveReferral(settings: ReferralSettings) {
    const value = { ...settings } as unknown as Prisma.InputJsonObject;
    await this.db.setting.upsert({
      where: { key: REFERRAL },
      create: { key: REFERRAL, value },
      update: { value },
    });
    return this.referral();
  }
  async activeReferral() {
    const r = await this.referral();
    return r.enabled ? { reward: r.reward } : null;
  }
  /** The programme as clients see it, or null when it is off. */
  async active() {
    const s = await this.settings();
    return s.enabled ? { every: s.every, reward: s.reward } : null;
  }
  /**
   * Which visit in a row each of these is for its client: completed visits by the same phone
   * before it, plus one. Visits without a phone are left out.
   */
  async numbers(visits: { id: string; guestPhone: string | null; startsAt: Date }[]) {
    const phones = new Set(visits.map((v) => key(v.guestPhone)).filter(Boolean));
    const result: Record<string, number> = {};
    if (!phones.size) return result;
    const done = await this.db.appointment.findMany({
      where: { status: 'COMPLETED', guestPhone: { not: null } },
      select: { id: true, guestPhone: true, startsAt: true },
    });
    const byPhone = new Map<string, { id: string; startsAt: Date }[]>();
    for (const d of done) {
      const k = key(d.guestPhone);
      if (phones.has(k)) byPhone.set(k, [...(byPhone.get(k) || []), d]);
    }
    for (const v of visits) {
      const k = key(v.guestPhone);
      if (!k) continue;
      const before = (byPhone.get(k) || []).filter((d) => d.id !== v.id && d.startsAt < v.startsAt);
      result[v.id] = before.length + 1;
    }
    return result;
  }
}
