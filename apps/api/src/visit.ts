import { Body, Controller, Get, Injectable, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { Telegram } from './telegram';
import { Push } from './push';
import { appointmentInclude, BookingService } from './booking/booking.service';
import { salonDate } from './availability/rules';
import { RescheduleDto, WaitlistDto } from './dto';
import { intlPhone } from './reminders';

/** Clients may move or cancel up to this long before the visit; later, they write in WhatsApp. */
export const CHANGE_BEFORE_MINUTES = 120;
const SECRET = 'visit-link-secret';
const when = (date: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: config.timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

/**
 * Personal links «/v/<id>.<signature>» that let a client see, move or cancel their own visit
 * without an account. The signing secret is created on first use and kept in the database.
 */
@Injectable()
export class VisitLinks {
  private secret?: Buffer;
  constructor(private db: Db) {}
  private async key() {
    if (this.secret) return this.secret;
    const existing = await this.db.setting.findUnique({ where: { key: SECRET } });
    if (!existing)
      await this.db.setting
        .create({ data: { key: SECRET, value: { value: randomBytes(32).toString('hex') } } })
        .catch(() => undefined);
    const row = await this.db.setting.findUniqueOrThrow({ where: { key: SECRET } });
    this.secret = Buffer.from((row.value as { value: string }).value, 'hex');
    return this.secret;
  }
  private sign(key: Buffer, id: string) {
    return createHmac('sha256', key).update(id).digest('base64url').slice(0, 22);
  }
  async ref(id: string) {
    return `${id}.${this.sign(await this.key(), id)}`;
  }
  async url(id: string) {
    return `${config.siteUrl}/v/${await this.ref(id)}`;
  }
  /** Adds `manageUrl` to visits shown to staff, so reminders can include the link. */
  async withLinks<T extends { id: string }>(visits: T[]) {
    const key = await this.key();
    return visits.map((v) => ({
      ...v,
      manageUrl: `${config.siteUrl}/v/${v.id}.${this.sign(key, v.id)}`,
    }));
  }
  /** The visit id from a link, or a 404 for anything forged or malformed. */
  async open(ref: string) {
    const [id, signature] = ref.split('.');
    const expected = id && /^[0-9a-f-]{36}$/.test(id) ? this.sign(await this.key(), id) : '';
    const a = Buffer.from(signature || ''),
      b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
      fail(404, 'NOT_FOUND', 'Ссылка не найдена. Напишите нам в WhatsApp.');
    return id;
  }
}

/** Clients waiting for a free time on a full day. */
@Injectable()
export class Waitlist {
  constructor(
    private db: Db,
    private telegram: Telegram,
    private push: Push,
  ) {}
  async join(b: WaitlistDto, now = new Date()) {
    const phone = intlPhone(b.phone);
    if (!phone) fail(400, 'INVALID_PHONE', 'Укажите телефон полностью, например +7 777 123 45 67.');
    const today = Temporal.PlainDate.from(salonDate(now, config.timezone));
    const date = Temporal.PlainDate.from(b.date);
    if (Temporal.PlainDate.compare(date, today) < 0 || today.until(date).days > 60)
      fail(400, 'INVALID_DATE', 'Выберите дату в ближайшие два месяца.');
    await this.db.waitlistEntry.upsert({
      where: { date_phone: { date: b.date, phone } },
      create: { date: b.date, phone, name: b.name, serviceId: b.serviceId ?? null },
      update: { name: b.name, serviceId: b.serviceId ?? null, contactedAt: null },
    });
    return { waiting: true };
  }
  list(date: string) {
    return this.db.waitlistEntry.findMany({
      where: { date, contactedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  async contacted(id: string) {
    await this.db.waitlistEntry.updateMany({ where: { id }, data: { contactedAt: new Date() } });
    return { id };
  }
  /** A visit was cancelled or moved: tell the salon who is waiting for that day. */
  async freed(visit: { startsAt: Date; serviceName: string }) {
    const date = salonDate(visit.startsAt, config.timezone);
    const waiting = await this.list(date);
    if (!waiting.length) return 0;
    const names = waiting.map((w) => w.name).join(', ');
    await Promise.all([
      this.telegram.notify([
        `Освободилось время · ${config.name}`,
        `${when(visit.startsAt)} (${visit.serviceName})`,
        `В листе ожидания на этот день: ${names}.`,
        'Предложите время в «Мой день» — кнопка «Предложить».',
      ]),
      this.push.notifyStaff({
        title: `Освободилось ${when(visit.startsAt)}`,
        body: `Ждут этот день: ${names}. Предложите время в «Мой день».`,
        tag: `freed-${date}`,
      }),
    ]);
    return waiting.length;
  }
}

@ApiTags('Публичные')
@Controller()
export class VisitController {
  private joins = new Map<string, { count: number; until: number }>();
  constructor(
    private db: Db,
    private links: VisitLinks,
    private booking: BookingService,
    private telegram: Telegram,
    private push: Push,
    private waitlist: Waitlist,
  ) {}
  private async visit(ref: string) {
    const id = await this.links.open(ref);
    const a = await this.db.appointment.findUnique({ where: { id }, include: appointmentInclude });
    if (!a) fail(404, 'NOT_FOUND', 'Запись не найдена. Напишите нам в WhatsApp.');
    return a;
  }
  /** Active, not started and more than CHANGE_BEFORE_MINUTES away. */
  private changeable(a: Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>) {
    const now = new Date();
    const active =
      a.status === 'CONFIRMED' || (a.status === 'PENDING' && !!a.holdUntil && a.holdUntil > now);
    return active && +a.startsAt - +now > CHANGE_BEFORE_MINUTES * 60000;
  }
  @Get('visit/:ref')
  @ApiOperation({ summary: 'Запись клиента по личной ссылке' })
  async show(@Param('ref') ref: string) {
    const a = await this.visit(ref);
    const now = new Date();
    return {
      id: a.id,
      name: a.guestName ?? a.customer?.name ?? '',
      serviceId: a.serviceId,
      serviceName: a.serviceName,
      masterId: a.masterId,
      master: a.master.name,
      priceMinor: a.priceMinor,
      durationMinutes: a.durationMinutes,
      startsAt: a.startsAt,
      status: a.status === 'PENDING' && (!a.holdUntil || a.holdUntil <= now) ? 'EXPIRED' : a.status,
      canChange: this.changeable(a),
      changeBeforeMinutes: CHANGE_BEFORE_MINUTES,
    };
  }
  private refuse(a: Parameters<VisitController['changeable']>[0]) {
    if (!this.changeable(a))
      fail(
        409,
        'TOO_LATE',
        'Эту запись уже нельзя изменить онлайн. Напишите нам в WhatsApp — договоримся.',
      );
  }
  @Post('visit/:ref/cancel')
  @ApiOperation({ summary: 'Клиент отменяет свою запись' })
  async cancel(@Param('ref') ref: string) {
    const a = await this.visit(ref);
    this.refuse(a);
    const { count } = await this.db.appointment.updateMany({
      where: { id: a.id, status: { in: ['CONFIRMED', 'PENDING'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), holdUntil: null },
    });
    if (count) {
      const name = a.guestName ?? 'Клиент';
      await Promise.all([
        this.telegram.notify([
          `Клиент отменил запись · ${config.name}`,
          `${name}${a.guestPhone ? ', ' + a.guestPhone : ''}`,
          `${when(a.startsAt)} — ${a.serviceName}`,
          'Время снова свободно на сайте.',
        ]),
        this.push.notifyStaff({
          title: `Отмена: ${name}`,
          body: `${when(a.startsAt)} — ${a.serviceName}. Время снова свободно.`,
          tag: `cancel-${a.id}`,
        }),
      ]);
      await this.waitlist.freed(a);
    }
    return { status: 'CANCELLED' };
  }
  @Post('visit/:ref/reschedule')
  @ApiOperation({ summary: 'Клиент переносит запись на другое свободное время' })
  async reschedule(@Param('ref') ref: string, @Body() b: RescheduleDto) {
    const a = await this.visit(ref);
    this.refuse(a);
    const moved = await this.booking.book(
      { serviceId: a.serviceId, masterId: a.masterId, startsAt: b.startsAt },
      a.customerId
        ? { customerId: a.customerId }
        : { guestName: a.guestName ?? 'Клиент', guestPhone: a.guestPhone ?? undefined },
      { replaces: a.id, pending: a.status === 'PENDING' },
    );
    const name = a.guestName ?? a.customer?.name ?? 'Клиент';
    await Promise.all([
      this.telegram.notify([
        `Клиент перенёс запись · ${config.name}`,
        `${name}${a.guestPhone ? ', ' + a.guestPhone : ''} — ${a.serviceName}`,
        `Было: ${when(a.startsAt)}`,
        `Стало: ${when(moved.startsAt)}`,
      ]),
      this.push.notifyStaff({
        title: `Перенос: ${name}`,
        body: `${when(a.startsAt)} → ${when(moved.startsAt)} · ${a.serviceName}`,
        tag: `move-${moved.id}`,
      }),
    ]);
    await this.waitlist.freed(a);
    return { ref: await this.links.ref(moved.id), startsAt: moved.startsAt };
  }
  @Post('waitlist')
  @ApiOperation({ summary: 'Сообщить, если на этот день освободится время' })
  join(@Body() b: WaitlistDto, @Req() req: Request) {
    const now = Date.now();
    for (const [k, v] of this.joins) if (v.until < now) this.joins.delete(k);
    const key = req.ip || 'unknown';
    const hits = this.joins.get(key) || { count: 0, until: now + 60000 };
    hits.count++;
    this.joins.set(key, hits);
    if (hits.count > 5) fail(429, 'RATE_LIMIT', 'Слишком много заявок. Подождите одну минуту.');
    return this.waitlist.join(b);
  }
}
