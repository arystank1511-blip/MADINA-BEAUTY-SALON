import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { AvailabilityDto, BookingRequestDto, MasterQuery, SOURCE_NAMES } from './dto';
import { salonDate } from './availability/rules';
import { fail } from './errors';
import { Telegram } from './telegram';
import { BookingService } from './booking/booking.service';
import { intlPhone } from './phone';
import { Clients } from './clients';
import { Site } from './site';
import { Loyalty } from './loyalty';
import { Growth } from './growth';
import { Push } from './push';
import { VisitLinks } from './visit';
@ApiTags('Публичные')
@Controller()
export class PublicController {
  constructor(
    private db: Db,
    private booking: BookingService,
    private telegram: Telegram,
    private clients: Clients,
    private site: Site,
    private push: Push,
    private links: VisitLinks,
    private loyalty: Loyalty,
    private growth: Growth,
  ) {}
  private requests = new Map<string, { count: number; until: number }>();
  @Get('config') @ApiOperation({ summary: 'Настройки салона' }) settings() {
    const { production: _p, origin: _o, ...publicConfig } = config;
    return publicConfig;
  }
  @Get('services') @ApiOperation({ summary: 'Активные услуги' }) services() {
    return this.db.service.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  }
  @Get('masters') @ApiOperation({ summary: 'Активные мастера, фильтр по услуге' }) masters(
    @Query() q: MasterQuery,
  ) {
    return this.db.master.findMany({
      where: {
        isActive: true,
        ...(q.serviceId
          ? { services: { some: { serviceId: q.serviceId, service: { isActive: true } } } }
          : {}),
      },
      include: { services: { where: { service: { isActive: true } }, include: { service: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Get('availability')
  @ApiOperation({ summary: 'Свободные слоты в ISO-8601; персональные данные отсутствуют' })
  async availability(@Query() q: AvailabilityDto) {
    return {
      slots: (await this.booking.availability(this.db, q.serviceId, q.masterId, q.date)).slots,
      timezone: config.timezone,
    };
  }
  @Post('booking-requests')
  @ApiOperation({
    summary:
      'Заявка гостя: держит время до подтверждения мастером, уведомляет в Telegram; 409 если время занято',
  })
  async bookingRequest(@Body() body: BookingRequestDto, @Req() req: Request) {
    const now = Date.now();
    for (const [k, v] of this.requests) if (v.until < now) this.requests.delete(k);
    const key = req.ip || 'unknown';
    const hits = this.requests.get(key) || { count: 0, until: now + 60000 };
    hits.count++;
    this.requests.set(key, hits);
    if (hits.count > 5) fail(429, 'RATE_LIMIT', 'Слишком много заявок. Подождите одну минуту.');
    // The phone is how the salon confirms and reminds; it must be a full number.
    if (!intlPhone(body.phone))
      fail(400, 'INVALID_PHONE', 'Укажите телефон полностью, например +7 777 123 45 67.');
    if (await this.clients.isBlocked(body.phone)) {
      await this.telegram.notify([
        `Попытка записи · ${config.name}`,
        `${body.name}, ${body.phone} — в списке «только через WhatsApp». Время не занято.`,
      ]);
      fail(
        403,
        'BOOKING_BY_WHATSAPP',
        'Для записи, пожалуйста, напишите нам в WhatsApp — подберём удобное время.',
      );
    }
    if (body.birthday) await this.clients.rememberBirthday(body.phone, body.birthday);
    const visits = await this.bookFamily(body);
    const when = (d: Date) =>
      new Intl.DateTimeFormat('ru-RU', {
        timeZone: config.timezone,
        day: 'numeric',
        month: 'long',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    const time = (d: Date) =>
      new Intl.DateTimeFormat('ru-RU', {
        timeZone: config.timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    const price = (minor: number) =>
      new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: config.currency,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 2,
      }).format(minor / 100);
    const [a] = visits;
    const referral = await this.loyalty.activeReferral();
    const [telegram] = await Promise.all([
      this.telegram.notify([
        `Новая заявка · ${config.name}`,
        ...(visits.length > 1
          ? [
              `Семья, ${visits.length} чел. подряд, ${when(a.startsAt)}:`,
              ...visits.map(
                (v) =>
                  `${time(v.startsAt)} ${v.guestName} — ${v.serviceName} (${price(v.priceMinor)})`,
              ),
            ]
          : [
              `Услуга: ${a.serviceName} (${price(a.priceMinor)}, ${a.durationMinutes} мин)`,
              `Время: ${when(a.startsAt)}`,
              `Имя: ${body.name}`,
            ]),
        `Мастер: ${a.master.name}`,
        `Телефон: ${body.phone}`,
        ...(body.source ? [`Узнали: ${SOURCE_NAMES[body.source]}`] : []),
        ...(referral && a.referrerPhone ? [`Посоветовал(а): +${a.referrerPhone}`] : []),
        'Время придержано на 3 часа. Подтвердите в «Мой день».',
      ]),
      this.push.notifyStaff({
        title:
          visits.length > 1
            ? `Новая заявка: ${body.name} и ещё ${visits.length - 1}`
            : `Новая заявка: ${body.name}`,
        body: `${when(a.startsAt)} · ${visits.map((v) => v.serviceName).join(', ')}. Подтвердите или откажите.`,
        tag: `request-${a.id}`,
      }),
    ]);
    return {
      id: a.id,
      startsAt: a.startsAt,
      holdUntil: a.holdUntil,
      telegram,
      manageUrl: await this.links.url(a.id),
      visits: await Promise.all(
        visits.map(async (v) => ({
          id: v.id,
          name: v.guestName,
          serviceName: v.serviceName,
          startsAt: v.startsAt,
          manageUrl: await this.links.url(v.id),
        })),
      ),
    };
  }
  /**
   * The client's visit, then each family member's right after the previous one (the first free
   * start within an hour). If someone does not fit, every visit of this request is released.
   */
  private async bookFamily(body: BookingRequestDto) {
    const referral = await this.loyalty.activeReferral();
    const own = intlPhone(body.phone);
    const referrer = referral && body.referrerPhone ? intlPhone(body.referrerPhone) : '';
    const extra = {
      source: body.source ?? null,
      // Recommending yourself does not count.
      referrerPhone: referrer && referrer !== own ? referrer : null,
    };
    const visits = [
      await this.booking.book(
        body,
        { guestName: body.name, guestPhone: body.phone },
        { pending: true },
      ),
    ];
    try {
      for (const member of body.family ?? []) {
        const previous = visits[visits.length - 1];
        const date = salonDate(previous.startsAt, config.timezone);
        const { slots } = await this.booking.availability(
          this.db,
          member.serviceId,
          body.masterId,
          date,
        );
        const after = +previous.occupiedUntil;
        const next = slots.find(
          (s) => Date.parse(s.startsAt) >= after && Date.parse(s.startsAt) <= after + 3600000,
        );
        if (!next)
          fail(
            409,
            'FAMILY_NO_TIME',
            'Подряд для всех не хватает времени. Выберите время пораньше или другой день.',
          );
        visits.push(
          await this.booking.book(
            { serviceId: member.serviceId, masterId: body.masterId, startsAt: next.startsAt },
            { guestName: member.name, guestPhone: body.phone },
            { pending: true },
          ),
        );
      }
    } catch (e) {
      await this.db.appointment.updateMany({
        where: { id: { in: visits.map((v) => v.id) } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), holdUntil: null },
      });
      throw e;
    }
    await this.db.appointment.updateMany({
      where: { id: { in: visits.map((v) => v.id) } },
      data: { source: extra.source },
    });
    if (extra.referrerPhone)
      await this.db.appointment.update({
        where: { id: visits[0].id },
        data: { referrerPhone: extra.referrerPhone },
      });
    visits[0] = { ...visits[0], ...extra };
    return visits;
  }
  @Get('offers')
  @ApiOperation({
    summary:
      'Включённые предложения: { loyalty, birthdayDiscount, referral } — null, пока выключены',
  })
  async offers() {
    const { birthdayDiscount } = await this.growth.settings();
    return {
      loyalty: await this.loyalty.active(),
      birthdayDiscount: birthdayDiscount > 0 ? birthdayDiscount : null,
      referral: await this.loyalty.activeReferral(),
    };
  }
  @Get('promo') @ApiOperation({ summary: 'Баннер акции: { promo: {...} | null }' }) async promo() {
    // Wrapped: a bare null would be an empty response body.
    return { promo: await this.site.activePromo() };
  }
  @Get('gallery') @ApiOperation({ summary: 'Фото работ салона, новые сначала' }) gallery() {
    return this.site.gallery();
  }
  @Get('gallery/:id')
  @ApiOperation({ summary: 'Файл фото; неизменяемый, кэшируется надолго' })
  async photo(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const p = await this.site.photo(id);
    if (!p) fail(404, 'NOT_FOUND', 'Фото не найдено.');
    res.setHeader('Content-Type', p.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(p.data));
  }
  @Get('health') @ApiOperation({ summary: 'Liveness' }) health() {
    return { status: 'ok' };
  }
  @Get('ready') @ApiOperation({ summary: 'Readiness: подключение и миграции БД' }) async ready() {
    await this.db.service.count();
    return { status: 'ok' };
  }
}
