import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Db } from './db';
import { config } from './config';
import { AvailabilityDto, MasterQuery } from './dto';
import { BookingService } from './booking/booking.service';
@ApiTags('Публичные')
@Controller()
export class PublicController {
  constructor(
    private db: Db,
    private booking: BookingService,
  ) {}
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
  @Get('health') @ApiOperation({ summary: 'Liveness' }) health() {
    return { status: 'ok' };
  }
  @Get('ready') @ApiOperation({ summary: 'Readiness: подключение и миграции БД' }) async ready() {
    await this.db.service.count();
    return { status: 'ok' };
  }
}
