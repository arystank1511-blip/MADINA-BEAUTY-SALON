import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { AvailabilityDto, BookingRequestDto, MasterQuery } from './dto';
import { fail } from './errors';
import { Telegram } from './telegram';
import { BookingService } from './booking/booking.service';
import { intlPhone } from './reminders';
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
    const a = await this.booking.book(
      body,
      { guestName: body.name, guestPhone: body.phone },
      { pending: true },
    );
    const when = new Intl.DateTimeFormat('ru-RU', {
      timeZone: config.timezone,
      day: 'numeric',
      month: 'long',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(a.startsAt);
    const price = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: config.currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 2,
    }).format(a.priceMinor / 100);
    const [telegram] = await Promise.all([
      this.telegram.notify([
        `Новая заявка · ${config.name}`,
        `Услуга: ${a.serviceName} (${price}, ${a.durationMinutes} мин)`,
        `Мастер: ${a.master.name}`,
        `Время: ${when}`,
        `Имя: ${body.name}`,
        `Телефон: ${body.phone}`,
        'Время придержано на 3 часа. Подтвердите в «Мой день».',
      ]),
      this.push.notifyStaff({
        title: `Новая заявка: ${body.name}`,
        body: `${when} · ${a.serviceName}. Подтвердите или откажите.`,
        tag: `request-${a.id}`,
      }),
    ]);
    return {
      id: a.id,
      startsAt: a.startsAt,
      holdUntil: a.holdUntil,
      telegram,
      manageUrl: await this.links.url(a.id),
    };
  }
  @Get('offers')
  @ApiOperation({
    summary:
      'Включённые предложения: { loyalty: { every, reward } | null, birthdayDiscount: % | null }',
  })
  async offers() {
    const { birthdayDiscount } = await this.growth.settings();
    return {
      loyalty: await this.loyalty.active(),
      birthdayDiscount: birthdayDiscount > 0 ? birthdayDiscount : null,
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
