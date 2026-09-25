import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Admin, AuthRequest, safeUser, SessionGuard } from '../auth/auth';
import { Db } from '../db';
import {
  AdminBookingDto,
  HoursDto,
  ListDto,
  MasterDto,
  MasterPatch,
  ServiceDto,
  ServicePatch,
  ServicesDto,
  TimeOffDto,
  WindowDto,
} from '../dto';
import { BookingService, Tx } from '../booking/booking.service';
import { config } from '../config';
import { fail } from '../errors';
import { fitsSchedule } from '../availability/rules';
@ApiTags('Администрирование')
@ApiCookieAuth()
@Admin()
@UseGuards(SessionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private db: Db,
    private booking: BookingService,
  ) {}
  private async schedule<T>(id: string, mutate: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await this.booking.lockMaster(tx, id);
        const result = await mutate(tx);
        const m = await tx.master.findUniqueOrThrow({
          where: { id },
          include: { workingHours: true, breaks: true, timeOffs: true },
        });
        for (const b of m.breaks) {
          const w = m.workingHours.find((w) => w.weekday === b.weekday);
          if (!w || b.startTime < w.startTime || b.endTime > w.endTime)
            fail(
              400,
              'INVALID_BREAK',
              'Перерыв должен находиться внутри рабочего окна. Сначала измените перерывы.',
            );
        }
        const appointments = await tx.appointment.findMany({
          where: { masterId: id, status: 'CONFIRMED', startsAt: { gt: new Date() } },
          select: {
            id: true,
            startsAt: true,
            occupiedUntil: true,
            serviceName: true,
            customer: { select: { name: true } },
          },
        });
        const conflicts = appointments.filter(
          (a) => !fitsSchedule(a.startsAt, a.occupiedUntil, { ...m, zone: config.timezone }),
        );
        if (conflicts.length)
          fail(409, 'SCHEDULE_CONFLICT', 'Изменение затрагивает подтверждённые записи.', {
            conflicts,
          });
        return result;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  private window(w: WindowDto) {
    if (w.startTime >= w.endTime)
      fail(400, 'INVALID_WINDOW', 'Начало должно быть раньше окончания, в пределах одного дня.');
  }
  @Get('services') @ApiOperation({ summary: 'Все услуги, включая неактивные' }) services() {
    return this.db.service.findMany({ orderBy: { createdAt: 'asc' } });
  }
  @Post('services') @ApiOperation({ summary: 'Добавить услугу' }) serviceCreate(
    @Body() b: ServiceDto,
  ) {
    return this.db.service.create({ data: b });
  }
  @Patch('services/:id')
  @ApiOperation({ summary: 'Изменить услугу; снимки существующих посещений сохраняются' })
  serviceUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() b: ServicePatch) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${id}::uuid FOR UPDATE`;
      return tx.service.update({ where: { id }, data: b });
    });
  }
  @Get('masters') @ApiOperation({ summary: 'Все мастера и их услуги' }) masters() {
    return this.db.master.findMany({
      include: { services: { include: { service: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('masters') @ApiOperation({ summary: 'Создать мастера' }) masterCreate(
    @Body() b: MasterDto,
  ) {
    return this.db.master.create({ data: b });
  }
  @Patch('masters/:id')
  @ApiOperation({ summary: 'Изменить профиль или активность мастера' })
  masterUpdate(@Param('id', ParseUUIDPipe) id: string, @Body() b: MasterPatch) {
    return this.db.$transaction(async (tx) => {
      await this.booking.lockMaster(tx, id);
      return tx.master.update({ where: { id }, data: b });
    });
  }
  @Put('masters/:id/services')
  @ApiOperation({ summary: 'Заменить набор услуг мастера' })
  masterServices(@Param('id', ParseUUIDPipe) id: string, @Body() b: ServicesDto) {
    return this.db.$transaction(async (tx) => {
      await this.booking.lockMaster(tx, id);
      if ((await tx.service.count({ where: { id: { in: b.serviceIds } } })) !== b.serviceIds.length)
        fail(400, 'INVALID_SERVICE', 'Одна из услуг не найдена.');
      await tx.masterService.deleteMany({ where: { masterId: id } });
      await tx.masterService.createMany({
        data: b.serviceIds.map((serviceId) => ({ masterId: id, serviceId })),
      });
      return { serviceIds: b.serviceIds };
    });
  }
  @Get('masters/:id/working-hours')
  @ApiOperation({ summary: 'Рабочие окна мастера; weekday 1=понедельник, 7=воскресенье' })
  hours(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.workingHours.findMany({ where: { masterId: id }, orderBy: { weekday: 'asc' } });
  }
  @Put('masters/:id/working-hours')
  @ApiOperation({ summary: 'Атомарная замена рабочих окон; конфликтующие посещения дают 409' })
  hoursPut(@Param('id', ParseUUIDPipe) id: string, @Body() b: HoursDto) {
    b.hours.forEach((w) => this.window(w));
    if (new Set(b.hours.map((w) => w.weekday)).size !== b.hours.length)
      fail(400, 'DUPLICATE_DAY', 'Допустимо одно рабочее окно на день.');
    return this.schedule(id, async (tx) => {
      await tx.workingHours.deleteMany({ where: { masterId: id } });
      await tx.workingHours.createMany({ data: b.hours.map((w) => ({ ...w, masterId: id })) });
      return tx.workingHours.findMany({ where: { masterId: id } });
    });
  }
  @Get('masters/:id/breaks') @ApiOperation({ summary: 'Регулярные перерывы' }) breaks(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.recurringBreak.findMany({
      where: { masterId: id },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }
  @Post('masters/:id/breaks') @ApiOperation({ summary: 'Добавить перерыв' }) breakCreate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: WindowDto,
  ) {
    this.window(b);
    return this.schedule(id, (tx) => tx.recurringBreak.create({ data: { ...b, masterId: id } }));
  }
  @Put('masters/:id/breaks/:breakId') @ApiOperation({ summary: 'Изменить перерыв' }) breakPut(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('breakId', ParseUUIDPipe) breakId: string,
    @Body() b: WindowDto,
  ) {
    this.window(b);
    return this.schedule(id, (tx) =>
      tx.recurringBreak.update({ where: { id: breakId, masterId: id }, data: b }),
    );
  }
  @Delete('masters/:id/breaks/:breakId') @ApiOperation({ summary: 'Удалить перерыв' }) breakDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('breakId', ParseUUIDPipe) breakId: string,
  ) {
    return this.schedule(id, (tx) =>
      tx.recurringBreak.delete({ where: { id: breakId, masterId: id } }),
    );
  }
  @Get('masters/:id/time-offs') @ApiOperation({ summary: 'Отсутствия мастера' }) offs(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.db.timeOff.findMany({ where: { masterId: id }, orderBy: { startsAt: 'asc' } });
  }
  private off(b: TimeOffDto) {
    const startsAt = new Date(b.startsAt),
      endsAt = new Date(b.endsAt);
    if (startsAt >= endsAt)
      fail(400, 'INVALID_INTERVAL', 'Окончание отсутствия должно быть позже начала.');
    return { startsAt, endsAt, reason: b.reason };
  }
  @Post('masters/:id/time-offs') @ApiOperation({ summary: 'Добавить отсутствие' }) offCreate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: TimeOffDto,
  ) {
    const data = this.off(b);
    return this.schedule(id, (tx) => tx.timeOff.create({ data: { ...data, masterId: id } }));
  }
  @Put('masters/:id/time-offs/:offId') @ApiOperation({ summary: 'Изменить отсутствие' }) offPut(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offId', ParseUUIDPipe) offId: string,
    @Body() b: TimeOffDto,
  ) {
    const data = this.off(b);
    return this.schedule(id, (tx) =>
      tx.timeOff.update({ where: { id: offId, masterId: id }, data }),
    );
  }
  @Delete('masters/:id/time-offs/:offId')
  @ApiOperation({ summary: 'Удалить отсутствие' })
  offDelete(@Param('id', ParseUUIDPipe) id: string, @Param('offId', ParseUUIDPipe) offId: string) {
    return this.schedule(id, (tx) => tx.timeOff.delete({ where: { id: offId, masterId: id } }));
  }
  @Get('customers') @ApiOperation({ summary: 'Существующие клиенты, постранично' }) async customers(
    @Query() q: ListDto,
  ) {
    const where = { role: 'CUSTOMER' as const };
    return {
      items: await this.db.user.findMany({
        where,
        select: safeUser,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { name: 'asc' },
      }),
      total: await this.db.user.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('appointments')
  @ApiOperation({ summary: 'Все посещения с фильтрами и пагинацией' })
  appointments(@Query() q: ListDto) {
    return this.booking.list(q);
  }
  @Post('appointments')
  @ApiOperation({ summary: 'Записать существующего клиента по общим правилам доступности' })
  create(@Body() b: AdminBookingDto) {
    return this.booking.create(b, b.customerId);
  }
  @Patch('appointments/:id/cancel') @ApiOperation({ summary: 'Отменить будущую запись' }) cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.booking.change(id, req.actor);
  }
  @Patch('appointments/:id/complete')
  @ApiOperation({ summary: 'Завершить подтверждённое посещение после endsAt' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.change(id, req.actor, true);
  }
}
