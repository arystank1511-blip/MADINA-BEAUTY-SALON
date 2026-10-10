import { Controller, Get, Headers, Injectable } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { Telegram } from './telegram';
import { activeAt } from './booking/booking.service';
import { WhatsApp } from './whatsapp';
import { Growth } from './growth';
import { Clients } from './clients';
import { salonDate, startOfDay } from './availability/rules';
import { Prisma } from '@prisma/client';

/** How long before a visit the salon gets its heads-up. */
export const REMIND_MINUTES = 60;
/** Salon time of the daily Telegram summary. */
const SUMMARY_AT = '09:00';

/** Kazakhstan number in international form (7XXXXXXXXXX) for wa.me links, or ''. */
export const intlPhone = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 10) return '7' + d;
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  return d.length >= 11 ? d : '';
};

const clock = (date: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

/** Template variables of the reminder: {{1}} name, {{2}} when, {{3}} service. */
export const reminderParams = (a: {
  guestName: string | null;
  startsAt: Date;
  serviceName: string;
}) => [a.guestName || 'уважаемый клиент', `сегодня в ${clock(a.startsAt)}`, a.serviceName];

/**
 * For each visit starting within the next hour: an automatic WhatsApp reminder to the client
 * (when the WhatsApp Business API is set up in the admin) and one Telegram heads-up to the salon.
 */
@Injectable()
export class Reminders {
  constructor(
    private db: Db,
    private telegram: Telegram,
    private whatsapp: WhatsApp,
    private growth: Growth,
    private clients: Clients,
  ) {}
  private window(now: Date) {
    return { gt: now, lte: new Date(+now + REMIND_MINUTES * 60000) };
  }
  async run(now = new Date()) {
    const completed = await this.completePast(now);
    const whatsapp = await this.remindClients(now);
    const sent = await this.alertSalon(now);
    const summary = await this.morningSummary(now);
    const growth = await this.growth.autoSend(now);
    return { sent, whatsapp, summary, completed, ...growth };
  }
  /**
   * Confirmed visits from earlier days become completed, so the history and statistics are
   * right without anyone pressing «Завершить». «Не пришёл» still works on them afterwards.
   */
  private async completePast(now: Date) {
    const today = startOfDay(salonDate(now, config.timezone), config.timezone);
    const { count } = await this.db.appointment.updateMany({
      where: { status: 'CONFIRMED', endsAt: { lte: today } },
      data: { status: 'COMPLETED' },
    });
    return count;
  }
  /** From 09:00 salon time, once a day: today's visits in Telegram. */
  private async morningSummary(now: Date) {
    if (!this.telegram.enabled || clock(now) < SUMMARY_AT) return false;
    const date = salonDate(now, config.timezone);
    const key = `summary:${date}`;
    try {
      // The row is the claim: a second run the same day fails on the primary key.
      await this.db.setting.create({ data: { key, value: { at: now.toISOString() } } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
    await this.db.setting.deleteMany({ where: { key: { startsWith: 'summary:', not: key } } });
    const visits = await this.db.appointment.findMany({
      where: {
        ...activeAt(now),
        status: { in: ['CONFIRMED', 'PENDING'] },
        startsAt: { gte: startOfDay(date, config.timezone), lt: new Date(+now + 24 * 3600000) },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    const today = visits.filter((a) => salonDate(a.startsAt, config.timezone) === date);
    const day = new Intl.DateTimeFormat('ru-RU', {
      timeZone: config.timezone,
      day: 'numeric',
      month: 'long',
    }).format(now);
    const pending = today.filter((a) => a.status === 'PENDING').length;
    const birthdays = await this.clients.birthdaysToday(now);
    const ok = await this.telegram.notify([
      `Доброе утро! Сегодня, ${day} · ${config.name}`,
      today.length ? `Записей: ${today.length}` : 'Записей на сегодня пока нет.',
      ...today.map(
        (a) =>
          `${clock(a.startsAt)} ${a.customer?.name || a.guestName || 'Клиент'} — ${a.serviceName}` +
          (a.status === 'PENDING' ? ' (ждёт подтверждения)' : '') +
          (a.guestPhone ? ` · ${a.guestPhone}` : ''),
      ),
      ...(pending ? [`Ждут подтверждения: ${pending}. Ответьте в «Мой день».`] : []),
      ...(birthdays.length
        ? [
            `День рождения: ${birthdays.map((b) => `${b.name || 'клиент'} (${b.displayPhone})`).join(', ')}. Поздравьте во вкладке «Возврат клиентов».`,
          ]
        : []),
    ]);
    // Telegram was down: release the claim so a later run sends the summary.
    if (!ok) await this.db.setting.delete({ where: { key } });
    return ok;
  }
  /** WhatsApp Business API: the client gets the approved reminder template, once per visit. */
  private async remindClients(now: Date) {
    const settings = await this.whatsapp.active();
    if (!settings) return 0;
    const due = await this.db.appointment.findMany({
      where: {
        ...activeAt(now),
        status: 'CONFIRMED',
        waSentAt: null,
        guestPhone: { not: null },
        startsAt: this.window(now),
      },
      orderBy: { startsAt: 'asc' },
    });
    let sent = 0;
    for (const a of due) {
      const phone = intlPhone(a.guestPhone);
      if (!phone) continue;
      // Claim first, so overlapping runs never message the client twice.
      const claimed = await this.db.appointment.updateMany({
        where: { id: a.id, waSentAt: null },
        data: { waSentAt: now },
      });
      if (!claimed.count) continue;
      const result = await this.whatsapp.send(settings, phone, reminderParams(a));
      await this.db.appointment.update({
        where: { id: a.id },
        // On failure the claim is released and the next run tries again; the error is shown.
        data: result.ok
          ? { remindedAt: now, waError: null }
          : { waSentAt: null, waError: result.error },
      });
      if (result.ok) sent++;
    }
    return sent;
  }
  /** Telegram: the salon gets one heads-up per visit, with a WhatsApp link if needed. */
  private async alertSalon(now: Date) {
    if (!this.telegram.enabled) return 0;
    const due = await this.db.appointment.findMany({
      where: {
        ...activeAt(now),
        status: { in: ['CONFIRMED', 'PENDING'] },
        alertedAt: null,
        startsAt: this.window(now),
      },
      include: { customer: { select: { name: true } }, master: { select: { name: true } } },
      orderBy: { startsAt: 'asc' },
    });
    let sent = 0;
    for (const a of due) {
      // Claim the visit first, so overlapping runs never send the same heads-up twice.
      const claimed = await this.db.appointment.updateMany({
        where: { id: a.id, alertedAt: null },
        data: { alertedAt: now },
      });
      if (!claimed.count) continue;
      const name = a.customer?.name || a.guestName || 'Клиент';
      const minutes = Math.max(1, Math.round((+a.startsAt - +now) / 60000));
      const phone = intlPhone(a.guestPhone);
      const text = [
        `Здравствуйте${a.guestName ? ', ' + a.guestName : ''}!`,
        `Напоминаю, вы записаны сегодня в ${clock(a.startsAt)} — ${a.serviceName}.`,
        `Салон «${config.name}», ${config.address}.`,
        'Если планы изменятся, напишите, пожалуйста. Спасибо!',
      ].join('\n');
      const auto = !!a.waSentAt;
      const ok = await this.telegram.notify(
        [
          `Через ${minutes} мин: ${clock(a.startsAt)} · ${config.name}`,
          `Клиент: ${name}`,
          ...(a.guestPhone ? [`Телефон: ${a.guestPhone}`] : []),
          `Услуга: ${a.serviceName}`,
          `Мастер: ${a.master.name}`,
          ...(a.status === 'PENDING' ? ['Заявка ещё не подтверждена!'] : []),
          ...(auto ? ['Клиенту автоматически отправлено напоминание в WhatsApp.'] : []),
          ...(a.waError && !auto ? [`WhatsApp API не отправил напоминание: ${a.waError}`] : []),
        ],
        phone && !auto
          ? [
              {
                text: 'Напомнить клиенту в WhatsApp',
                url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
              },
            ]
          : [],
      );
      // Telegram was down: release the claim so the next run tries again.
      if (!ok) await this.db.appointment.update({ where: { id: a.id }, data: { alertedAt: null } });
      else sent++;
    }
    return sent;
  }
}

@ApiTags('Публичные')
@Controller('cron')
export class RemindersController {
  constructor(private reminders: Reminders) {}
  @Get('reminders')
  @ApiOperation({
    summary:
      'Отправить в Telegram напоминания о визитах в ближайший час (вызывается по расписанию)',
  })
  run(@Headers('authorization') auth?: string) {
    // Optional shared secret; without it the call is harmless: it only sends what is due, once.
    const secret = process.env.CRON_SECRET?.trim();
    if (secret && auth !== `Bearer ${secret}`) fail(401, 'UNAUTHORIZED', 'Неверный ключ.');
    return this.reminders.run();
  }
}
