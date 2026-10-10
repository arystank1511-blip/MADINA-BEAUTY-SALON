import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import { Db } from './db';
import { config } from './config';
import { Telegram } from './telegram';
import { Push } from './push';
import { Stats } from './stats';
import { Money } from './money';
import { activeAt } from './booking/booking.service';
import { salonDate, startOfDay } from './availability/rules';

/** Salon time on Monday when last week's report goes out. */
const REPORT_AT = '09:00';
const tenge = (minor: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: config.currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(minor / 100);
const change = (now: number, before: number) => {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0
    ? ' (как на прошлой неделе)'
    : ` (${pct > 0 ? '+' : ''}${pct}% к прошлой неделе)`;
};
const span = (from: Temporal.PlainDate, to: Temporal.PlainDate) => {
  const f = (d: Temporal.PlainDate, month: boolean) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      ...(month ? { month: 'long' } : {}),
      timeZone: 'UTC',
    }).format(new Date(d.toString() + 'T12:00:00Z'));
  return from.month === to.month
    ? `${f(from, false)}–${f(to, true)}`
    : `${f(from, true)} – ${f(to, true)}`;
};

/** Monday morning: last week's numbers in Telegram and as a push to staff phones. */
@Injectable()
export class WeeklyReport {
  constructor(
    private db: Db,
    private telegram: Telegram,
    private push: Push,
    private stats: Stats,
    private money: Money,
  ) {}
  /** The report for the full week (Monday–Sunday) before the one containing `now`. */
  async build(now = new Date()) {
    const today = Temporal.PlainDate.from(salonDate(now, config.timezone));
    const monday = today.subtract({ days: today.dayOfWeek - 1 });
    const from = monday.subtract({ days: 7 }),
      to = monday.subtract({ days: 1 });
    const [week, before, booked, low] = await Promise.all([
      this.stats.period(from.toString(), to.toString(), now),
      this.stats.period(
        from.subtract({ days: 7 }).toString(),
        from.subtract({ days: 1 }).toString(),
        now,
      ),
      this.db.appointment.count({
        where: {
          ...activeAt(now),
          status: { in: ['CONFIRMED', 'PENDING'] },
          startsAt: {
            gte: now,
            lt: startOfDay(monday.add({ days: 7 }).toString(), config.timezone),
          },
        },
      }),
      this.money.low(),
    ]);
    const top = week.services.slice(0, 3).map((s) => `${s.name} (${s.visits})`);
    const lines = [
      `Итоги недели ${span(from, to)} · ${config.name}`,
      `Выручка: ${tenge(week.revenueMinor)}${change(week.revenueMinor, before.revenueMinor)}`,
      ...(week.expensesMinor
        ? [`Расходы: ${tenge(week.expensesMinor)} · прибыль: ${tenge(week.profitMinor)}`]
        : []),
      `Визитов: ${week.completed}${before.completed ? ` (неделей раньше ${before.completed})` : ''}` +
        (week.completed ? ` · средний чек ${tenge(week.averageMinor)}` : ''),
      `Клиентов: ${week.clients}, из них новых: ${week.newClients}`,
      ...(week.noShows || week.cancelled
        ? [`Не пришли: ${week.noShows} · отмены: ${week.cancelled}`]
        : []),
      ...(top.length ? [`Популярное: ${top.join(', ')}`] : []),
      ...(week.cashMinor || week.kaspiMinor
        ? [`Наличные ${tenge(week.cashMinor)} · Kaspi ${tenge(week.kaspiMinor)}`]
        : []),
      ...(week.unpaid ? [`Без отметки оплаты: ${week.unpaid} — отметьте в «Мой день».`] : []),
      ...(low.length
        ? [`Заканчивается: ${low.map((m) => `${m.name} (${m.quantity} ${m.unit})`).join(', ')}`]
        : []),
      `На эту неделю уже записано: ${booked}`,
    ];
    return {
      from: from.toString(),
      to: to.toString(),
      lines,
      push: {
        title: `Неделя: ${tenge(week.revenueMinor)}, визитов ${week.completed}`,
        body: `Новых клиентов: ${week.newClients}. На эту неделю записано: ${booked}.`,
      },
    };
  }
  async send(now = new Date()) {
    const report = await this.build(now);
    const [telegram, pushed] = await Promise.all([
      this.telegram.notify(report.lines),
      this.push.notifyStaff({ ...report.push, tag: `weekly-${report.from}`, url: '/admin' }),
    ]);
    return { ...report, delivered: telegram || pushed > 0 };
  }
  /** From 09:00 on Monday, once per week. */
  async scheduled(now: Date, clock: string) {
    const today = Temporal.PlainDate.from(salonDate(now, config.timezone));
    if (today.dayOfWeek !== 1 || clock < REPORT_AT) return false;
    if (!this.telegram.enabled && !(await this.push.subscribers())) return false;
    const key = `weekly:${today.toString()}`;
    try {
      // The row is the claim: a second run the same Monday fails on the primary key.
      await this.db.setting.create({ data: { key, value: { at: now.toISOString() } } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
    await this.db.setting.deleteMany({ where: { key: { startsWith: 'weekly:', not: key } } });
    const { delivered } = await this.send(now);
    // Nothing was delivered: release the claim so a later run sends the report.
    if (!delivered) await this.db.setting.delete({ where: { key } });
    return delivered;
  }
}
