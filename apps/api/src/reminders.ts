import { Controller, Get, Headers, Injectable } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { Telegram } from './telegram';
import { activeAt } from './booking/booking.service';

/** How long before a visit the salon gets its heads-up. */
export const REMIND_MINUTES = 60;

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

/** Sends the salon one Telegram message per visit starting within the next hour. */
@Injectable()
export class Reminders {
  constructor(
    private db: Db,
    private telegram: Telegram,
  ) {}
  async run(now = new Date()) {
    if (!this.telegram.enabled) return { sent: 0 };
    const due = await this.db.appointment.findMany({
      where: {
        ...activeAt(now),
        status: { in: ['CONFIRMED', 'PENDING'] },
        alertedAt: null,
        startsAt: { gt: now, lte: new Date(+now + REMIND_MINUTES * 60000) },
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
      const ok = await this.telegram.notify(
        [
          `Через ${minutes} мин: ${clock(a.startsAt)} · ${config.name}`,
          `Клиент: ${name}`,
          ...(a.guestPhone ? [`Телефон: ${a.guestPhone}`] : []),
          `Услуга: ${a.serviceName}`,
          `Мастер: ${a.master.name}`,
          ...(a.status === 'PENDING' ? ['Заявка ещё не подтверждена!'] : []),
        ],
        phone
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
    return { sent };
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
