import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import { Db } from '../db';
import { config } from '../config';
import { fail, unavailable } from '../errors';
import { BookingDto, ListDto } from '../dto';
import { Actor, safeUser } from '../auth/auth';
import { startOfDay, salonDate, slotsForDay } from '../availability/rules';
export type Tx = Prisma.TransactionClient;
export const appointmentInclude = {
  master: { select: { id: true, name: true, avatarUrl: true } },
  customer: { select: safeUser },
} as const;
@Injectable()
export class BookingService {
  constructor(private db: Db) {}
  async lockMaster(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Master" WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows.length) fail(404, 'NOT_FOUND', 'Мастер не найден.');
  }
  async availability(tx: Tx, serviceId: string, masterId: string, date: string, now = new Date()) {
    const [service, master] = await Promise.all([
      tx.service.findUnique({ where: { id: serviceId } }),
      tx.master.findUnique({
        where: { id: masterId },
        include: { services: true, workingHours: true, breaks: true, timeOffs: true },
      }),
    ]);
    if (!service?.isActive || !master?.isActive)
      fail(400, 'INACTIVE', 'Услуга или мастер недоступны. Выберите другие.');
    if (!master.services.some((s) => s.serviceId === serviceId))
      fail(400, 'UNSUPPORTED_SERVICE', 'Этот мастер не оказывает выбранную услугу.');
    const start = startOfDay(date, config.timezone);
    const end = startOfDay(
      Temporal.PlainDate.from(date).add({ days: 1 }).toString(),
      config.timezone,
    );
    const appointments = await tx.appointment.findMany({
      where: {
        masterId,
        status: { not: 'CANCELLED' },
        startsAt: { lt: end },
        occupiedUntil: { gt: start },
      },
      select: { startsAt: true, occupiedUntil: true, status: true },
    });
    return {
      service,
      slots: slotsForDay({
        date,
        zone: config.timezone,
        now,
        durationMinutes: service.durationMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        ...master,
        appointments,
      }),
    };
  }
  async create(body: BookingDto, customerId: string) {
    return this.db.$transaction(
      async (tx) => {
        // A shared service lock allows bookings for different masters concurrently.
        await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${body.serviceId}::uuid FOR SHARE`;
        await this.lockMaster(tx, body.masterId);
        const customer = await tx.user.findUnique({
          where: { id: customerId },
          select: { role: true },
        });
        if (!customer || customer.role !== 'CUSTOMER')
          fail(400, 'INVALID_CUSTOMER', 'Выберите существующего клиента.');
        const start = new Date(body.startsAt);
        const { service, slots } = await this.availability(
          tx,
          body.serviceId,
          body.masterId,
          salonDate(start, config.timezone),
        );
        const slot = slots.find((s) => s.startsAt === start.toISOString());
        if (!slot) unavailable();
        return tx.appointment.create({
          data: {
            customerId,
            masterId: body.masterId,
            serviceId: body.serviceId,
            startsAt: start,
            endsAt: new Date(slot.endsAt),
            occupiedUntil: new Date(slot.occupiedUntil),
            serviceName: service.name,
            priceMinor: service.priceMinor,
            durationMinutes: service.durationMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
          },
          include: appointmentInclude,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 15000,
        timeout: 15000,
      },
    );
  }
  async get(id: string, actor: Actor) {
    const a = await this.db.appointment.findUnique({ where: { id }, include: appointmentInclude });
    if (!a || (actor.role !== 'ADMIN' && a.customerId !== actor.id))
      fail(404, 'NOT_FOUND', 'Запись не найдена.');
    return a;
  }
  async change(id: string, actor: Actor, complete = false) {
    const initial = await this.get(id, actor);
    return this.db.$transaction(
      async (tx) => {
        await this.lockMaster(tx, initial.masterId);
        const a = await tx.appointment.findUniqueOrThrow({ where: { id } });
        if (complete) {
          if (actor.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Доступ запрещён.');
          if (a.status === 'COMPLETED') return a;
          if (a.status !== 'CONFIRMED' || a.endsAt > new Date())
            fail(
              409,
              'INVALID_STATUS',
              'Завершить можно только подтверждённое посещение после его окончания.',
            );
          return tx.appointment.update({
            where: { id },
            data: { status: 'COMPLETED' },
            include: appointmentInclude,
          });
        }
        if (a.status === 'CANCELLED') return a;
        if (a.status !== 'CONFIRMED' || a.startsAt <= new Date())
          fail(409, 'CANNOT_CANCEL', 'Отменить можно только будущее подтверждённое посещение.');
        return tx.appointment.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actor.id },
          include: appointmentInclude,
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
  async list(query: ListDto, customerId?: string) {
    const from = query.from ? Temporal.PlainDate.from(query.from) : undefined;
    const to = query.to ? Temporal.PlainDate.from(query.to) : undefined;
    if (from && to && (Temporal.PlainDate.compare(to, from) < 0 || from.until(to).days > 90))
      fail(400, 'INVALID_RANGE', 'Диапазон дат должен быть от 0 до 90 дней.');
    const where: Prisma.AppointmentWhereInput = {
      customerId,
      masterId: query.masterId,
      status: query.status,
      startsAt: {
        gte: from ? startOfDay(from.toString(), config.timezone) : undefined,
        lt: to ? startOfDay(to.add({ days: 1 }).toString(), config.timezone) : undefined,
      },
    };
    const [items, total] = await Promise.all([
      this.db.appointment.findMany({
        where,
        include: appointmentInclude,
        orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.appointment.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
