import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { AvailabilityDto, BookingRequestDto, MasterQuery } from './dto';
import { fail } from './errors';
import { Telegram } from './telegram';
import { BookingService } from './booking/booking.service';
@ApiTags('Публичные')
@Controller()
export class PublicController {
  constructor(
    private db: Db,
    private booking: BookingService,
    private telegram: Telegram,
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
      maximumFractionDigits: 2,
    }).format(a.priceMinor / 100);
    const telegram = await this.telegram.notify([
      `Новая заявка · ${config.name}`,
      `Услуга: ${a.serviceName} (${price}, ${a.durationMinutes} мин)`,
      `Мастер: ${a.master.name}`,
      `Время: ${when}`,
      `Имя: ${body.name}`,
      ...(body.phone ? [`Телефон: ${body.phone}`] : []),
      'Время придержано на 3 часа. Подтвердите в «Мой день».',
    ]);
    return { id: a.id, startsAt: a.startsAt, holdUntil: a.holdUntil, telegram };
  }
  @Get('health') @ApiOperation({ summary: 'Liveness' }) health() {
    return { status: 'ok' };
  }
  @Get('ready') @ApiOperation({ summary: 'Readiness: подключение и миграции БД' }) async ready() {
    await this.db.service.count();
    return { status: 'ok' };
  }
}
