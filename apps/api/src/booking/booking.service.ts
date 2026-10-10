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
/** Who the visit is for: a registered customer or a person known only by name. */
export type Client = { customerId: string } | { guestName: string; guestPhone?: string };
/** How long a site request holds its slot while waiting for the master. */
export const HOLD_MINUTES = 180;
/** Appointments that occupy time: everything except cancelled visits and lapsed holds. */
export const activeAt = (now: Date): Prisma.AppointmentWhereInput => ({
  status: { not: 'CANCELLED' },
  NOT: { status: 'PENDING', holdUntil: { lte: now } },
});
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
        ...activeAt(now),
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
  /** Lapsed site holds become cancelled so the exclusion constraint frees their time. */
  async expireHolds(tx: Tx, masterId: string, now = new Date()) {
    await tx.appointment.updateMany({
      where: { masterId, status: 'PENDING', holdUntil: { lte: now } },
      data: { status: 'CANCELLED', cancelledAt: now, holdUntil: null },
    });
  }
  async create(body: BookingDto, customerId: string) {
    return this.book(body, { customerId });
  }
  /**
   * Books a visit after re-checking availability under the master lock.
   * `pending` holds the slot for HOLD_MINUTES until the master confirms it;
   * `walkIn` lets the master book slots starting right now (clients need 30 minutes' notice).
   */
  async book(
    body: BookingDto,
    client: Client,
    options: { pending?: boolean; walkIn?: boolean } = {},
  ) {
    return this.db.$transaction(
      async (tx) => {
        // A shared service lock allows bookings for different masters concurrently.
        await tx.$queryRaw`SELECT id FROM "Service" WHERE id=${body.serviceId}::uuid FOR SHARE`;
        await this.lockMaster(tx, body.masterId);
        if ('customerId' in client) {
          const customer = await tx.user.findUnique({
            where: { id: client.customerId },
            select: { role: true },
          });
          if (!customer || customer.role !== 'CUSTOMER')
            fail(400, 'INVALID_CUSTOMER', 'Выберите существующего клиента.');
        }
        const now = new Date();
        await this.expireHolds(tx, body.masterId, now);
        const start = new Date(body.startsAt);
        const { service, slots } = await this.availability(
          tx,
          body.serviceId,
          body.masterId,
          salonDate(start, config.timezone),
          // Clients need 30 minutes' notice; the master may book a visit that started up to 30 minutes ago.
          options.walkIn ? new Date(+now - 60 * 60000) : now,
        );
        const slot = slots.find((s) => s.startsAt === start.toISOString());
        if (!slot) unavailable();
        return tx.appointment.create({
          data: {
            ...('customerId' in client
              ? { customerId: client.customerId }
              : { guestName: client.guestName, guestPhone: client.guestPhone || null }),
            masterId: body.masterId,
            serviceId: body.serviceId,
            startsAt: start,
            endsAt: new Date(slot.endsAt),
            occupiedUntil: new Date(slot.occupiedUntil),
            serviceName: service.name,
            priceMinor: service.priceMinor,
            durationMinutes: service.durationMinutes,
            bufferAfterMinutes: service.bufferAfterMinutes,
            ...(options.pending
              ? {
                  status: 'PENDING' as const,
                  holdUntil: new Date(Math.min(+now + HOLD_MINUTES * 60000, +start)),
                }
              : {}),
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
  async change(
    id: string,
    actor: Actor,
    action: 'cancel' | 'complete' | 'confirm' | 'noShow' = 'cancel',
  ) {
    const initial = await this.get(id, actor);
    return this.db.$transaction(
      async (tx) => {
        await this.lockMaster(tx, initial.masterId);
        const a = await tx.appointment.findUniqueOrThrow({ where: { id } });
        if (action === 'confirm') {
          if (actor.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Доступ запрещён.');
          if (a.status === 'CONFIRMED') return a;
          if (a.status !== 'PENDING' || !a.holdUntil || a.holdUntil <= new Date())
            fail(409, 'HOLD_EXPIRED', 'Заявка уже неактуальна: время освободилось или отменено.');
          return tx.appointment.update({
            where: { id },
            data: { status: 'CONFIRMED', holdUntil: null },
            include: appointmentInclude,
          });
        }
        if (action === 'noShow') {
          if (actor.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Доступ запрещён.');
          if (a.status === 'NO_SHOW') return a;
          // Visits are completed automatically the next morning, so a late «не пришёл» still works.
          if ((a.status !== 'CONFIRMED' && a.status !== 'COMPLETED') || a.startsAt > new Date())
            fail(409, 'INVALID_STATUS', 'Отметить «не пришёл» можно только после начала записи.');
          return tx.appointment.update({
            where: { id },
            data: { status: 'NO_SHOW' },
            include: appointmentInclude,
          });
        }
        if (action === 'complete') {
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
        if (!['CONFIRMED', 'PENDING'].includes(a.status) || a.startsAt <= new Date())
          fail(409, 'CANNOT_CANCEL', 'Отменить можно только будущее посещение.');
        return tx.appointment.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelledById: actor.id,
            holdUntil: null,
          },
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
