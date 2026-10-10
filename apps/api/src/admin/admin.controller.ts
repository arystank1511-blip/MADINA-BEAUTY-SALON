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
  GrowthSettingsDto,
  DayQuery,
  HoursDto,
  QuickBookingDto,
  ListDto,
  MasterDto,
  MasterPatch,
  ServiceDto,
  ServicePatch,
  ServicesDto,
  TimeOffDto,
  WhatsAppSettingsDto,
  WhatsAppTestDto,
  WindowDto,
} from '../dto';
import { activeAt, appointmentInclude, BookingService, Tx } from '../booking/booking.service';
import { config } from '../config';
import { fail } from '../errors';
import { fitsSchedule, localInstant, salonDate, startOfDay } from '../availability/rules';
import { Temporal } from '@js-temporal/polyfill';
import { Prisma } from '@prisma/client';
import { intlPhone, reminderParams, Reminders } from '../reminders';
import { WhatsApp } from '../whatsapp';
import { Growth } from '../growth';
/** Comparable phone key: the last 10 digits, so +7 777…, 8 777… and 777… match. */
export const phoneKey = (phone: string | null | undefined) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
};
@ApiTags('Администрирование')
@ApiCookieAuth()
@Admin()
@UseGuards(SessionGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private db: Db,
    private booking: BookingService,
    private reminders: Reminders,
    private whatsapp: WhatsApp,
    private growth: Growth,
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
          where: { masterId: id, ...activeAt(new Date()), startsAt: { gt: new Date() } },
          select: {
            id: true,
            startsAt: true,
            occupiedUntil: true,
            serviceName: true,
            guestName: true,
            customer: { select: { name: true } },
          },
        });
        const conflicts = appointments
          .filter(
            (a) => !fitsSchedule(a.startsAt, a.occupiedUntil, { ...m, zone: config.timezone }),
          )
          .map(({ guestName, customer, ...a }) => ({
            ...a,
            customer: { name: customer?.name ?? guestName ?? '' },
          }));
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
    // Active services first, in price-list order; hidden ones stay at the bottom.
    return this.db.service.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
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
  @Post('quick-appointments')
  @ApiOperation({ summary: 'Запись клиента без аккаунта (имя, телефон) — для мастера' })
  quick(@Body() b: QuickBookingDto) {
    return this.booking.book(
      b,
      { guestName: b.guestName, guestPhone: b.guestPhone },
      { walkIn: true },
    );
  }
  @Get('day')
  @ApiOperation({ summary: 'День мастера: часы работы, перерывы, отсутствия и записи' })
  async day(@Query() q: DayQuery) {
    const now = new Date();
    const date = q.date || salonDate(now, config.timezone);
    const masters = await this.db.master.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const masterId = q.masterId || masters[0]?.id;
    if (!masterId) fail(404, 'NOT_FOUND', 'Нет активных мастеров.');
    const master = await this.db.master.findUniqueOrThrow({
      where: { id: masterId },
      include: {
        workingHours: true,
        breaks: true,
        services: { where: { service: { isActive: true } }, include: { service: true } },
      },
    });
    const weekday = Temporal.PlainDate.from(date).dayOfWeek;
    const from = startOfDay(date, config.timezone);
    const to = startOfDay(
      Temporal.PlainDate.from(date).add({ days: 1 }).toString(),
      config.timezone,
    );
    const at = (time: string) => localInstant(date, time, config.timezone).toISOString();
    const hours = master.workingHours.find((w) => w.weekday === weekday);
    const services = master.services
      .map((s) => s.service)
      .sort((a, b) => +a.createdAt - +b.createdAt);
    // Start times where each service fits, with the master's walk-in notice rule.
    const fits = Object.fromEntries(
      await Promise.all(
        services.map(async (s) => [
          s.id,
          (
            await this.booking.availability(this.db, s.id, masterId, date, new Date(+now - 3600000))
          ).slots.map((slot) => slot.startsAt),
        ]),
      ),
    ) as Record<string, string[]>;
    const [timeOffs, appointments] = await Promise.all([
      this.db.timeOff.findMany({
        where: { masterId, startsAt: { lt: to }, endsAt: { gt: from } },
        orderBy: { startsAt: 'asc' },
      }),
      this.db.appointment.findMany({
        where: { masterId, ...activeAt(now), startsAt: { gte: from, lt: to } },
        include: appointmentInclude,
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    // Past no-shows per phone (last 10 digits), so the master sees unreliable clients.
    const phones = [
      ...new Set(appointments.map((a) => phoneKey(a.guestPhone)).filter(Boolean)),
    ] as string[];
    const missed = phones.length
      ? await this.db.appointment.findMany({
          where: { status: 'NO_SHOW', guestPhone: { not: null } },
          select: { guestPhone: true },
        })
      : [];
    const noShows: Record<string, number> = {};
    for (const m of missed) {
      const key = phoneKey(m.guestPhone);
      if (key && phones.includes(key)) noShows[key] = (noShows[key] || 0) + 1;
    }
    return {
      date,
      now: now.toISOString(),
      noShows,
      masters,
      master: { id: master.id, name: master.name },
      services,
      fits,
      hours: hours
        ? {
            start: hours.startTime,
            end: hours.endTime,
            startsAt: at(hours.startTime),
            endsAt: at(hours.endTime),
          }
        : null,
      breaks: master.breaks
        .filter((b) => b.weekday === weekday)
        .map((b) => ({
          start: b.startTime,
          end: b.endTime,
          startsAt: at(b.startTime),
          endsAt: at(b.endTime),
        })),
      timeOffs,
      appointments,
    };
  }
  @Get('pending')
  @ApiOperation({ summary: 'Заявки с сайта, ожидающие подтверждения мастера' })
  pending() {
    return this.db.appointment.findMany({
      where: { status: 'PENDING', holdUntil: { gt: new Date() } },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
    });
  }
  @Get('reminders')
  @ApiOperation({ summary: 'Визиты на ближайшие сутки: кому напомнить и кому уже напомнили' })
  async upcoming() {
    const now = new Date();
    // Opening the admin also sends any due Telegram heads-up, in case the schedule ran late.
    await this.reminders.run(now);
    return this.db.appointment.findMany({
      where: {
        ...activeAt(now),
        status: { in: ['CONFIRMED', 'PENDING'] },
        startsAt: { gt: now, lte: new Date(+now + 24 * 3600000) },
      },
      include: appointmentInclude,
      orderBy: { startsAt: 'asc' },
    });
  }
  @Get('growth')
  @ApiOperation({ summary: 'Кого попросить об отзыве и кого пригласить снова' })
  async growthLists() {
    const now = new Date();
    const settings = await this.growth.settings();
    const [reviews, returns] = await Promise.all([
      this.growth.reviewsDue(now),
      this.growth.returnsDue(now, settings.returnWeeks),
    ]);
    return {
      settings,
      reviews: reviews.map((a) => ({
        ...a,
        text: this.growth.reviewText(a.guestName, settings.reviewUrl),
      })),
      returns: returns.map((a) => ({ ...a, text: this.growth.returnText(a.guestName) })),
    };
  }
  @Put('growth')
  @ApiOperation({ summary: 'Ссылка на отзывы и через сколько недель приглашать снова' })
  growthSave(@Body() b: GrowthSettingsDto) {
    return this.growth.save(b);
  }
  private async mark(id: string, data: Prisma.AppointmentUpdateManyMutationInput) {
    const { count } = await this.db.appointment.updateMany({ where: { id }, data });
    if (!count) fail(404, 'NOT_FOUND', 'Запись не найдена.');
    return { id, ...data };
  }
  @Patch('appointments/:id/review-requested')
  @ApiOperation({ summary: 'Отметить, что клиента попросили об отзыве' })
  reviewRequested(@Param('id', ParseUUIDPipe) id: string) {
    return this.mark(id, { reviewRequestedAt: new Date() });
  }
  @Patch('appointments/:id/invited')
  @ApiOperation({ summary: 'Отметить, что клиента пригласили снова' })
  invited(@Param('id', ParseUUIDPipe) id: string) {
    return this.mark(id, { invitedAt: new Date() });
  }
  @Get('whatsapp')
  @ApiOperation({ summary: 'Настройки WhatsApp Business API (токен не возвращается)' })
  whatsappSettings() {
    return this.whatsapp.publicSettings();
  }
  @Put('whatsapp')
  @ApiOperation({ summary: 'Сохранить настройки WhatsApp Business API; пустой токен — не менять' })
  async whatsappSave(@Body() b: WhatsAppSettingsDto) {
    const { accessToken, ...rest } = b;
    const token = accessToken?.trim();
    const next = { ...rest, ...(token ? { accessToken: token } : {}) };
    if (next.enabled) {
      const current = await this.whatsapp.settings();
      if (!next.phoneNumberId || !next.templateName || !(token || current.accessToken))
        fail(
          400,
          'WHATSAPP_INCOMPLETE',
          'Чтобы включить автоматические сообщения, заполните Phone number ID, токен и шаблон.',
        );
    }
    return this.whatsapp.save(next);
  }
  @Post('whatsapp/test')
  @ApiOperation({ summary: 'Отправить пробное напоминание на указанный номер' })
  async whatsappTest(@Body() b: WhatsAppTestDto) {
    const s = await this.whatsapp.settings();
    if (!s.phoneNumberId || !s.accessToken || !s.templateName)
      fail(400, 'WHATSAPP_INCOMPLETE', 'Сначала сохраните Phone number ID, токен и шаблон.');
    const to = intlPhone(b.phone);
    if (!to) fail(400, 'INVALID_PHONE', 'Введите номер полностью, например +7 777 123 45 67.');
    const startsAt = new Date(Date.now() + 3600000);
    return this.whatsapp.send(
      s,
      to,
      reminderParams({ guestName: 'Тест', startsAt, serviceName: 'Пробное сообщение' }),
    );
  }
  @Patch('appointments/:id/reminded')
  @ApiOperation({ summary: 'Отметить, что клиенту отправлено напоминание в WhatsApp' })
  async reminded(@Param('id', ParseUUIDPipe) id: string) {
    const remindedAt = new Date();
    const { count } = await this.db.appointment.updateMany({
      where: { id, status: { in: ['CONFIRMED', 'PENDING'] } },
      data: { remindedAt },
    });
    if (!count) fail(404, 'NOT_FOUND', 'Запись не найдена или уже не активна.');
    return { remindedAt };
  }
  @Patch('appointments/:id/confirm')
  @ApiOperation({ summary: 'Подтвердить заявку с сайта' })
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.change(id, req.actor, 'confirm');
  }
  @Patch('appointments/:id/cancel') @ApiOperation({ summary: 'Отменить будущую запись' }) cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.booking.change(id, req.actor);
  }
  @Patch('appointments/:id/no-show')
  @ApiOperation({ summary: 'Клиент не пришёл: отметка для начавшейся подтверждённой записи' })
  noShow(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.change(id, req.actor, 'noShow');
  }
  @Patch('appointments/:id/complete')
  @ApiOperation({ summary: 'Завершить подтверждённое посещение после endsAt' })
  complete(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.change(id, req.actor, 'complete');
  }
}
