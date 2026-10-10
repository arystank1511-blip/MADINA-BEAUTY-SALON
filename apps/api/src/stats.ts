import { Injectable } from '@nestjs/common';
import { Temporal } from '@js-temporal/polyfill';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { salonDate, startOfDay } from './availability/rules';

const key = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

/** Salon numbers for a period: visits, revenue (paid amount, else list price), services, clients. */
@Injectable()
export class Stats {
  constructor(private db: Db) {}
  async period(fromDate?: string, toDate?: string, now = new Date()) {
    const today = Temporal.PlainDate.from(salonDate(now, config.timezone));
    const from = fromDate ? Temporal.PlainDate.from(fromDate) : today.with({ day: 1 });
    const to = toDate ? Temporal.PlainDate.from(toDate) : today;
    if (Temporal.PlainDate.compare(to, from) < 0 || from.until(to).days > 366)
      fail(400, 'INVALID_RANGE', 'Период — от одного дня до года.');
    const start = startOfDay(from.toString(), config.timezone);
    const end = startOfDay(to.add({ days: 1 }).toString(), config.timezone);
    const visits = await this.db.appointment.findMany({
      where: {
        startsAt: { gte: start, lt: end },
        status: { in: ['COMPLETED', 'NO_SHOW', 'CANCELLED'] },
      },
      select: {
        status: true,
        startsAt: true,
        serviceName: true,
        priceMinor: true,
        paidMinor: true,
        paymentMethod: true,
        guestPhone: true,
        customerId: true,
      },
    });
    const done = visits.filter((v) => v.status === 'COMPLETED');
    const noShows = visits.filter((v) => v.status === 'NO_SHOW').length;
    const amount = (v: (typeof done)[number]) => v.paidMinor ?? v.priceMinor;
    const days = new Map<string, { revenueMinor: number; visits: number }>();
    for (let d = from; Temporal.PlainDate.compare(d, to) <= 0; d = d.add({ days: 1 }))
      days.set(d.toString(), { revenueMinor: 0, visits: 0 });
    const services = new Map<string, { visits: number; revenueMinor: number }>();
    let cash = 0,
      kaspi = 0,
      unpaid = 0;
    const clients = new Set<string>();
    for (const v of done) {
      const day = days.get(salonDate(v.startsAt, config.timezone));
      if (day) {
        day.revenueMinor += amount(v);
        day.visits++;
      }
      const s = services.get(v.serviceName) || { visits: 0, revenueMinor: 0 };
      s.visits++;
      s.revenueMinor += amount(v);
      services.set(v.serviceName, s);
      if (v.paidMinor === null) unpaid++;
      else if (v.paymentMethod === 'KASPI') kaspi += v.paidMinor;
      else cash += v.paidMinor;
      const client = key(v.guestPhone) || v.customerId || '';
      if (client) clients.add(client);
    }
    // New clients: their first completed visit ever falls inside the period.
    const phones = [...clients].filter((c) => /^\d{10}$/.test(c));
    const earlier = phones.length
      ? await this.db.appointment.findMany({
          where: { status: 'COMPLETED', startsAt: { lt: start }, guestPhone: { not: null } },
          select: { guestPhone: true },
        })
      : [];
    const returning = new Set(earlier.map((e) => key(e.guestPhone)));
    const revenueMinor = done.reduce((sum, v) => sum + amount(v), 0);
    const spent = await this.db.expense.groupBy({
      by: ['category'],
      where: { date: { gte: from.toString(), lte: to.toString() } },
      _sum: { amountMinor: true },
    });
    const expenseCategories = spent
      .map((r) => ({ category: r.category, amountMinor: r._sum.amountMinor ?? 0 }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
    const expensesMinor = expenseCategories.reduce((sum, c) => sum + c.amountMinor, 0);
    // Where clients of this period heard about the salon, and how they rated their visits.
    const [sources, rated] = await Promise.all([
      this.db.appointment.groupBy({
        by: ['source'],
        where: {
          startsAt: { gte: start, lt: end },
          source: { not: null },
          status: { not: 'CANCELLED' },
        },
        _count: { _all: true },
      }),
      this.db.appointment.aggregate({
        where: { startsAt: { gte: start, lt: end }, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    return {
      from: from.toString(),
      to: to.toString(),
      completed: done.length,
      noShows,
      cancelled: visits.filter((v) => v.status === 'CANCELLED').length,
      noShowRate: done.length + noShows ? noShows / (done.length + noShows) : 0,
      revenueMinor,
      expensesMinor,
      profitMinor: revenueMinor - expensesMinor,
      expenseCategories,
      sources: sources
        .map((s) => ({ source: s.source!, visits: s._count._all }))
        .sort((a, b) => b.visits - a.visits),
      ratingAvg: rated._avg.rating === null ? null : Math.round(rated._avg.rating * 10) / 10,
      ratings: rated._count.rating,
      // Whole tenge: the average check is a rough figure, not an amount to pay.
      averageMinor: done.length ? Math.round(revenueMinor / done.length / 100) * 100 : 0,
      cashMinor: cash,
      kaspiMinor: kaspi,
      unpaid,
      clients: clients.size,
      newClients: phones.filter((p) => !returning.has(p)).length,
      days: [...days.entries()].map(([date, d]) => ({ date, ...d })),
      services: [...services.entries()]
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) => b.revenueMinor - a.revenueMinor),
    };
  }
}
