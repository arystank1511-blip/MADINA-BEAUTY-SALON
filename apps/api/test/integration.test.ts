import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import { INestApplication } from '@nestjs/common';
import { localInstant, salonDate } from '../src/availability/rules';
const loadCompiled = createRequire(__filename);
const origin = 'http://localhost:5173';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('/forma_test'))
  throw new Error('Only isolated database /forma_test is allowed. Set TEST_DATABASE_URL.');
process.env.DATABASE_URL = url;
process.env.APP_ORIGIN = origin;
process.env.TRUST_PROXY = '1'; // Emulate the one sanitized hop used by the shipped nginx.
const db = new PrismaClient({ datasources: { db: { url } } });
let apps: INestApplication[] = [];
const urls: string[] = [];
type Reply = {
  id: string;
  role: string;
  code: string;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
  status: string;
  cancelledAt: string;
  priceMinor: number;
  durationMinutes: number;
  conflicts: unknown[];
  slots: { startsAt: string }[];
  items: { id: string }[];
  total: number;
};
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  instance = 0,
  csrf = true,
) {
  const res = await fetch(urls[instance] + '/api/v1' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { origin, 'x-csrf-protection': '1' } : {}),
      cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    body: (await res.json()) as Reply,
    cookie: res.headers.get('set-cookie')?.split(';')[0] || '',
  };
}
let c1 = '',
  c2 = '',
  admin = '',
  customerId = '';
const master = randomUUID(),
  master2 = randomUUID(),
  service = randomUUID();
const date = Temporal.PlainDate.from(salonDate(new Date(), 'Asia/Almaty'))
  .add({ days: 4 })
  .toString();
const start = (time: string) => localInstant(date, time, 'Asia/Almaty').toISOString();
const booking = (time: string, masterId = master) => ({
  serviceId: service,
  masterId,
  startsAt: start(time),
});
beforeAll(async () => {
  const { createApp } = loadCompiled('../dist/src/app.js') as {
    createApp: () => Promise<INestApplication>;
  };
  apps = [await createApp(), await createApp()];
  for (const app of apps) {
    await app.listen(0, '127.0.0.1');
    urls.push(await app.getUrl());
  }
  const suffix = randomUUID();
  const a = await call('/auth/register', 'POST', {
    name: 'Первый клиент',
    email: `first-${suffix}@example.com`,
    password: 'TestPassword123!',
  });
  expect(a.status).toBe(201);
  c1 = a.cookie;
  customerId = a.body.id;
  const b = await call('/auth/register', 'POST', {
    name: 'Второй клиент',
    email: `second-${suffix}@example.com`,
    password: 'TestPassword123!',
  });
  c2 = b.cookie;
  const a3 = await call('/auth/register', 'POST', {
    name: 'Администратор',
    email: `admin-${suffix}@example.com`,
    password: 'TestPassword123!',
  });
  admin = a3.cookie;
  await db.user.update({ where: { id: a3.body.id }, data: { role: 'ADMIN' } });
  await db.service.create({
    data: {
      id: service,
      name: 'Тестовая стрижка',
      description: 'test',
      priceMinor: 500000,
      durationMinutes: 60,
      bufferAfterMinutes: 15,
    },
  });
  for (const id of [master, master2])
    await db.master.create({
      data: {
        id,
        name: 'Тестовый мастер',
        description: 'test',
        services: { create: { serviceId: service } },
        workingHours: {
          create: Array.from({ length: 7 }, (_, i) => ({
            weekday: i + 1,
            startTime: '08:00',
            endTime: '22:00',
          })),
        },
      },
    });
});
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
  await db.$disconnect();
});
describe.sequential('real PostgreSQL, HTTP and independent Nest instances', () => {
  it('rejects role escalation, unauthenticated writes and CSRF', async () => {
    expect(
      (
        await call('/auth/register', 'POST', {
          name: 'Attacker',
          email: 'attack@example.com',
          password: 'TestPassword123!',
          role: 'ADMIN',
        })
      ).status,
    ).toBe(400);
    expect((await call('/appointments', 'POST', booking('08:00'))).status).toBe(401);
    expect((await call('/appointments', 'POST', booking('08:00'), c1, 0, false)).status).toBe(403);
    expect((await call('/admin/services', 'GET', undefined, c1)).status).toBe(403);
    expect(
      (await call('/appointments', 'POST', { ...booking('08:00'), customerId }, c1)).status,
    ).toBe(400);
  });
  it('two concurrent requests yield exactly one 201 and one 409', async () => {
    const r = await Promise.all([
      call('/appointments', 'POST', booking('08:00'), c1),
      call('/appointments', 'POST', booking('08:00'), c2),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(r.find((x) => x.status === 409)?.body.code).toBe('SLOT_UNAVAILABLE');
    expect(
      await db.appointment.count({
        where: {
          masterId: master,
          startsAt: new Date(start('08:00')),
          status: { not: 'CANCELLED' },
        },
      }),
    ).toBe(1);
  });
  it('different starts that overlap are serialized across two Nest instances', async () => {
    const r = await Promise.all([
      call('/appointments', 'POST', booking('10:00'), c1, 0),
      call('/appointments', 'POST', booking('10:15'), c2, 1),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });
  it('ten requests through both servers produce one winner', async () => {
    const r = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        call('/appointments', 'POST', booking('12:00'), i % 2 ? c1 : c2, i % 2),
      ),
    );
    expect(r.filter((x) => x.status === 201)).toHaveLength(1);
    expect(r.filter((x) => x.status === 409)).toHaveLength(9);
  });
  it('different masters can book at the same time', async () => {
    const r = await Promise.all([
      call('/appointments', 'POST', booking('14:00'), c1),
      call('/appointments', 'POST', booking('14:00', master2), c2, 1),
    ]);
    expect(r.map((x) => x.status)).toEqual([201, 201]);
  });
  it('ownership, cancellation idempotency and slot release', async () => {
    const a = await call('/appointments', 'POST', booking('16:00'), c1);
    expect(a.status).toBe(201);
    expect((await call(`/appointments/${a.body.id}`, 'GET', undefined, c2)).status).toBe(404);
    expect((await call(`/appointments/${a.body.id}/cancel`, 'PATCH', {}, c2)).status).toBe(404);
    const first = await call(`/appointments/${a.body.id}/cancel`, 'PATCH', {}, c1);
    const second = await call(`/appointments/${a.body.id}/cancel`, 'PATCH', {}, c1);
    expect(first.status).toBe(200);
    expect(second.body.cancelledAt).toBe(first.body.cancelledAt);
    expect((await call('/appointments', 'POST', booking('16:00'), c2)).status).toBe(201);
  });
  it('direct DB inserts cannot bypass exclusion constraint', async () => {
    const existing = await db.appointment.findFirstOrThrow({
      where: { masterId: master, status: 'CONFIRMED' },
    });
    const { id: _id, createdAt: _c, updatedAt: _u, ...data } = existing;
    await expect(db.appointment.create({ data: { ...data, id: randomUUID() } })).rejects.toThrow(
      /Appointment_no_overlap/,
    );
  });
  it('prices and durations are snapshots and service support is enforced', async () => {
    const before = await db.appointment.findFirstOrThrow({
      where: { masterId: master, status: 'CONFIRMED' },
    });
    expect(
      (
        await call(
          `/admin/services/${service}`,
          'PATCH',
          { priceMinor: 900000, durationMinutes: 90 },
          admin,
        )
      ).status,
    ).toBe(200);
    const after = await db.appointment.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.priceMinor).toBe(500000);
    expect(after.durationMinutes).toBe(60);
    await call(`/admin/masters/${master2}/services`, 'PUT', { serviceIds: [] }, admin);
    expect((await call('/appointments', 'POST', booking('18:00', master2), c1)).body.code).toBe(
      'UNSUPPORTED_SERVICE',
    );
  });
  it('rejects off-grid times, missing offset, past and outside hours', async () => {
    expect((await call('/appointments', 'POST', booking('18:07'), c1)).status).toBe(409);
    expect(
      (
        await call(
          '/appointments',
          'POST',
          { ...booking('18:00'), startsAt: date + 'T18:00:00' },
          c1,
        )
      ).status,
    ).toBe(400);
    expect((await call('/appointments', 'POST', booking('23:00'), c1)).status).toBe(409);
    expect(
      (
        await call(
          '/appointments',
          'POST',
          { ...booking('18:00'), startsAt: '2020-01-01T10:00:00Z' },
          c1,
        )
      ).status,
    ).toBe(409);
  });
  it('rolls back conflicting working hours, breaks and time off, returning affected visits', async () => {
    const q = await call(`/admin/masters/${master}/working-hours`, 'PUT', { hours: [] }, admin);
    expect(q.status).toBe(409);
    expect(q.body.conflicts.length).toBeGreaterThan(0);
    expect(await db.workingHours.count({ where: { masterId: master } })).toBe(7);
    const br = await call(
      `/admin/masters/${master}/breaks`,
      'POST',
      { weekday: Temporal.PlainDate.from(date).dayOfWeek, startTime: '08:00', endTime: '09:00' },
      admin,
    );
    expect(br.status).toBe(409);
    const off = await call(
      `/admin/masters/${master}/time-offs`,
      'POST',
      { startsAt: start('08:00'), endsAt: start('19:00'), reason: 'Выходной' },
      admin,
    );
    expect(off.status).toBe(409);
    expect(await db.timeOff.count({ where: { masterId: master } })).toBe(0);
  });
  it('admin creation uses the same rules and completion cannot run early', async () => {
    const a = await call('/admin/appointments', 'POST', { ...booking('18:00'), customerId }, admin);
    expect(a.status).toBe(201);
    expect(
      (await call(`/admin/appointments/${a.body.id}/complete`, 'PATCH', {}, admin)).status,
    ).toBe(409);
    expect(
      (await call('/admin/appointments', 'POST', { ...booking('18:00'), customerId }, admin))
        .status,
    ).toBe(409);
  });
  it('normalizes email, login/logout revoke sessions; duplicate email rejected', async () => {
    const email = `LOGIN-${randomUUID()}@example.com`;
    const a = await call('/auth/register', 'POST', {
      name: 'Login test',
      email,
      password: 'TestPassword123!',
    });
    expect(a.status).toBe(201);
    const login = await call('/auth/login', 'POST', {
      email: ' ' + email.toLowerCase() + ' ',
      password: 'TestPassword123!',
    });
    expect(login.status).toBe(201);
    expect((await call('/auth/me', 'GET', undefined, login.cookie)).status).toBe(200);
    expect((await call('/auth/logout', 'POST', {}, login.cookie)).status).toBe(201);
    expect((await call('/auth/me', 'GET', undefined, login.cookie)).status).toBe(401);
    expect(
      (
        await call('/auth/register', 'POST', {
          name: 'Duplicate',
          email: email.toLowerCase(),
          password: 'TestPassword123!',
        })
      ).status,
    ).toBe(409);
  });
  it('password change checks the current password and revokes other sessions', async () => {
    const email = `password-${randomUUID()}@example.com`;
    const first = await call('/auth/register', 'POST', {
      name: 'Password test',
      email,
      password: 'TestPassword123!',
    });
    const other = await call('/auth/login', 'POST', { email, password: 'TestPassword123!' });
    const change = (currentPassword: string, newPassword: string) =>
      call('/auth/password', 'POST', { currentPassword, newPassword }, first.cookie, 1);
    expect((await change('WrongPassword123!', 'NewPassword4567!')).status).toBe(400);
    expect((await change('TestPassword123!', 'short')).status).toBe(400);
    expect((await change('TestPassword123!', 'NewPassword4567!')).status).toBe(201);
    expect((await call('/auth/me', 'GET', undefined, first.cookie)).status).toBe(200);
    expect((await call('/auth/me', 'GET', undefined, other.cookie)).status).toBe(401);
    expect(
      (await call('/auth/login', 'POST', { email, password: 'TestPassword123!' }, '', 1)).status,
    ).toBe(401);
    expect(
      (await call('/auth/login', 'POST', { email, password: 'NewPassword4567!' }, '', 1)).status,
    ).toBe(201);
  });
  it('serves calendar queries across skipped or repeated midnight', async () => {
    const { config } = loadCompiled('../dist/src/config.js') as { config: { timezone: string } };
    const original = config.timezone;
    try {
      config.timezone = 'America/Havana';
      expect(
        (await call(`/availability?serviceId=${service}&masterId=${master}&date=2030-03-10`))
          .status,
      ).toBe(200);
      expect(
        (await call('/admin/appointments?from=2030-11-03&to=2030-11-03', 'GET', undefined, admin))
          .status,
      ).toBe(200);
    } finally {
      config.timezone = original;
    }
  });
  it('rate limits abusive client without blocking another behind the trusted proxy', async () => {
    const attempt = async (ip: string) =>
      fetch(urls[0] + '/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-csrf-protection': '1',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify({ email: 'missing@example.com', password: 'WrongPassword123!' }),
      });
    const results = await Promise.all(Array.from({ length: 21 }, () => attempt('192.0.2.10')));
    expect(results.some((r) => r.status === 429)).toBe(true);
    expect((await attempt('192.0.2.11')).status).toBe(401);
  });
});
