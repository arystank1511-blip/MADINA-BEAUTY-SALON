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
  it('site requests hold a slot until confirmed; lapsed holds free it', async () => {
    // A separate day keeps these checks independent of the bookings made above.
    const next = Temporal.PlainDate.from(date).add({ days: 1 }).toString();
    const booking = (time: string) => ({
      serviceId: service,
      masterId: master,
      startsAt: localInstant(next, time, 'Asia/Almaty').toISOString(),
    });
    const request = (time: string, name = 'Гость') =>
      call('/booking-requests', 'POST', { ...booking(time), name, phone: '+7 701 000 00 02' });
    const held = await request('16:00');
    expect(held.status).toBe(201);
    const row = await db.appointment.findUniqueOrThrow({ where: { id: held.body.id } });
    expect(row.status).toBe('PENDING');
    expect(row.guestName).toBe('Гость');
    expect(row.customerId).toBeNull();
    expect((await request('16:00', 'Второй')).status).toBe(409);
    expect(
      (await call(`/admin/appointments/${held.body.id}/confirm`, 'PATCH', {}, admin)).body.status,
    ).toBe('CONFIRMED');
    // A hold that lapsed no longer blocks the slot and is cancelled on the next booking.
    const lapsed = await request('12:00');
    await db.appointment.update({
      where: { id: lapsed.body.id },
      data: { holdUntil: new Date(Date.now() - 1000) },
    });
    expect(
      (await call(`/admin/appointments/${lapsed.body.id}/confirm`, 'PATCH', {}, admin)).status,
    ).toBe(409);
    const again = await request('12:00', 'Новый');
    expect(again.status).toBe(201);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: lapsed.body.id } })).status).toBe(
      'CANCELLED',
    );
    expect(
      (await call('/booking-requests', 'POST', { ...booking('21:00'), name: '' })).status,
    ).toBe(400);
    // The phone is required and must be a full number.
    for (const phone of [undefined, '', '12345', '+7 (701) 00'])
      expect(
        (await call('/booking-requests', 'POST', { ...booking('21:00'), name: 'Гость', phone }))
          .status,
      ).toBe(400);
  });
  it('master books guests without an account and sees them in the day view', async () => {
    const next = Temporal.PlainDate.from(date).add({ days: 1 }).toString();
    const at = (time: string) => localInstant(next, time, 'Asia/Almaty').toISOString();
    const booking = (time: string) => ({
      serviceId: service,
      masterId: master,
      startsAt: at(time),
    });
    const quick = (body: object) => call('/admin/quick-appointments', 'POST', body, admin);
    expect(
      (await quick({ ...booking('20:00'), guestName: 'Сауле', guestPhone: '8 777 222 33 44' }))
        .status,
    ).toBe(201);
    expect((await quick({ ...booking('20:00'), guestName: 'Дубль' })).status).toBe(409);
    expect((await quick({ ...booking('21:00') })).status).toBe(400);
    expect(
      (
        await call(
          '/admin/quick-appointments',
          'POST',
          { ...booking('21:00'), guestName: 'X1' },
          c1,
        )
      ).status,
    ).toBe(403);
    const day = await call(`/admin/day?date=${next}&masterId=${master}`, 'GET', undefined, admin);
    expect(day.status).toBe(200);
    const body = day.body as unknown as {
      appointments: { guestName: string | null; guestPhone: string | null; status: string }[];
      fits: Record<string, string[]>;
    };
    expect(
      body.appointments.some((a) => a.guestName === 'Сауле' && a.guestPhone === '8 777 222 33 44'),
    ).toBe(true);
    expect(body.fits[service]).not.toContain(at('20:00'));
  });
  it('marks missed visits and counts them per phone in the day view', async () => {
    // A fresh number per run, so missed visits from earlier runs on the same DB don't count.
    const tail = String(Math.floor(Math.random() * 1e4)).padStart(4, '0');
    const past = new Date(Date.now() - 2 * 3600000);
    past.setUTCSeconds(0, 0);
    const missed = await db.appointment.create({
      data: {
        guestName: 'Пропускающая',
        guestPhone: `8 (777) 555-${tail.slice(0, 2)}-${tail.slice(2)}`,
        masterId: master,
        serviceId: service,
        startsAt: past,
        endsAt: new Date(+past + 30 * 60000),
        occupiedUntil: new Date(+past + 30 * 60000),
        serviceName: 'Тест',
        priceMinor: 0,
        durationMinutes: 30,
        bufferAfterMinutes: 0,
      },
    });
    const mark = (id: string) => call(`/admin/appointments/${id}/no-show`, 'PATCH', {}, admin);
    expect((await call(`/admin/appointments/${missed.id}/no-show`, 'PATCH', {}, c1)).status).toBe(
      403,
    );
    expect((await mark(missed.id)).body.status).toBe('NO_SHOW');
    expect((await mark(missed.id)).status).toBe(200);
    const next = Temporal.PlainDate.from(date).add({ days: 2 }).toString();
    const future = await call(
      '/admin/quick-appointments',
      'POST',
      {
        serviceId: service,
        masterId: master,
        startsAt: localInstant(next, '12:00', 'Asia/Almaty').toISOString(),
        guestName: 'Пропускающая',
        guestPhone: `+7 777 555 ${tail.slice(0, 2)} ${tail.slice(2)}`,
      },
      admin,
    );
    expect(future.status).toBe(201);
    expect((await mark(future.body.id)).status).toBe(409);
    const day = await call(`/admin/day?date=${next}&masterId=${master}`, 'GET', undefined, admin);
    expect(
      (day.body as unknown as { noShows: Record<string, number> }).noShows['777555' + tail],
    ).toBe(1);
  });
  it('sends one Telegram heads-up an hour before a visit; admin marks the WhatsApp reminder', async () => {
    const { createServer } = await import('node:http');
    const sent: { chat_id: string; text: string }[] = [];
    const telegram = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        sent.push(JSON.parse(raw));
        res.setHeader('content-type', 'application/json').end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => telegram.listen(0, '127.0.0.1', resolve));
    const { port } = telegram.address() as { port: number };
    Object.assign(process.env, {
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: '42',
      TELEGRAM_API_URL: `http://127.0.0.1:${port}`,
    });
    const guest = `Гость ${randomUUID().slice(0, 8)}`;
    const visit = async (minutesAhead: number) => {
      const startsAt = new Date(Math.ceil(Date.now() / 60000 + minutesAhead) * 60000);
      return db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: guest,
          guestPhone: '8 777 123 45 67',
          serviceName: 'Тестовая стрижка',
          priceMinor: 500000,
          durationMinutes: 60,
          bufferAfterMinutes: 15,
          startsAt,
          endsAt: new Date(+startsAt + 3600000),
          occupiedUntil: new Date(+startsAt + 75 * 60000),
        },
      });
    };
    try {
      const soon = await visit(40),
        later = await visit(180);
      // Only the one-hour heads-ups; the 09:00 summary may also mention the guest.
      const mine = () =>
        sent.filter((m) => m.text.startsWith('<b>Через') && m.text.includes(guest));
      expect((await call('/cron/reminders')).status).toBe(200);
      expect(mine()).toHaveLength(1);
      expect(mine()[0].chat_id).toBe('42');
      expect(mine()[0].text).toContain('https://wa.me/77771234567?text=');
      expect(
        (await db.appointment.findUniqueOrThrow({ where: { id: soon.id } })).alertedAt,
      ).not.toBe(null);
      // Repeated runs (the schedule, opening the admin) never send the same heads-up twice.
      await call('/cron/reminders');
      const list = await call('/admin/reminders', 'GET', undefined, admin);
      expect(mine()).toHaveLength(1);
      const ids = (list.body as unknown as { id: string }[]).map((a) => a.id);
      expect(ids).toEqual(expect.arrayContaining([soon.id, later.id]));
      expect((await db.appointment.findUniqueOrThrow({ where: { id: later.id } })).alertedAt).toBe(
        null,
      );
      expect((await call(`/admin/appointments/${later.id}/reminded`, 'PATCH', {}, c1)).status).toBe(
        403,
      );
      expect(
        (await call(`/admin/appointments/${later.id}/reminded`, 'PATCH', {}, admin)).status,
      ).toBe(200);
      expect(
        (await db.appointment.findUniqueOrThrow({ where: { id: later.id } })).remindedAt,
      ).not.toBe(null);
      process.env.CRON_SECRET = 'cron-secret';
      expect((await call('/cron/reminders')).status).toBe(401);
      const auth = await fetch(urls[0] + '/api/v1/cron/reminders', {
        headers: { authorization: 'Bearer cron-secret' },
      });
      expect(auth.status).toBe(200);
      await db.appointment.updateMany({
        where: { id: { in: [soon.id, later.id] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    } finally {
      for (const key of [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID',
        'TELEGRAM_API_URL',
        'CRON_SECRET',
      ])
        delete process.env[key];
      telegram.close();
    }
  });
  it('09:00 Telegram summary once a day; past visits complete themselves, «не пришёл» still works', async () => {
    const { createServer } = await import('node:http');
    const sent: { text: string }[] = [];
    const telegram = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        sent.push(JSON.parse(raw));
        res.setHeader('content-type', 'application/json').end('{"ok":true}');
      });
    });
    await new Promise<void>((resolve) => telegram.listen(0, '127.0.0.1', resolve));
    Object.assign(process.env, {
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_CHAT_ID: '42',
      TELEGRAM_API_URL: `http://127.0.0.1:${(telegram.address() as { port: number }).port}`,
    });
    const { Reminders } = loadCompiled('../dist/src/reminders.js') as {
      Reminders: new (...args: never[]) => { run(now: Date): Promise<Record<string, unknown>> };
    };
    const reminders = apps[0].get(Reminders);
    const today = salonDate(new Date(), 'Asia/Almaty');
    const at = (day: string, time: string) => localInstant(day, time, 'Asia/Almaty');
    const guest = `Утро ${randomUUID().slice(0, 6)}`;
    const visit = (startsAt: Date) =>
      db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: guest,
          guestPhone: '+7 701 333 44 55',
          serviceName: 'Тестовая стрижка',
          priceMinor: 500000,
          durationMinutes: 30,
          bufferAfterMinutes: 0,
          startsAt,
          endsAt: new Date(+startsAt + 30 * 60000),
          occupiedUntil: new Date(+startsAt + 30 * 60000),
        },
      });
    await db.setting.deleteMany({ where: { key: { startsWith: 'summary:' } } });
    const twoDaysAgo = Temporal.PlainDate.from(today).subtract({ days: 2 }).toString();
    const past = await visit(at(twoDaysAgo, '15:30'));
    const later = await visit(at(today, '15:30'));
    try {
      // Before 09:00 nothing is sent; past visits are completed on any run.
      await reminders.run(at(today, '08:50'));
      expect(sent.some((m) => m.text.includes('Доброе утро'))).toBe(false);
      expect((await db.appointment.findUniqueOrThrow({ where: { id: past.id } })).status).toBe(
        'COMPLETED',
      );
      expect((await db.appointment.findUniqueOrThrow({ where: { id: later.id } })).status).toBe(
        'CONFIRMED',
      );
      await reminders.run(at(today, '09:05'));
      await reminders.run(at(today, '09:15'));
      const summaries = sent.filter((m) => m.text.includes('Доброе утро'));
      expect(summaries).toHaveLength(1);
      expect(summaries[0].text).toContain(`15:30 ${guest} — Тестовая стрижка`);
      expect(summaries[0].text).not.toContain('Ждут подтверждения');
      const missed = await call(`/admin/appointments/${past.id}/no-show`, 'PATCH', {}, admin);
      expect(missed.body.status).toBe('NO_SHOW');
    } finally {
      await db.appointment.updateMany({
        where: { id: { in: [past.id, later.id] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_API_URL'])
        delete process.env[key];
      telegram.close();
    }
  });
  it('WhatsApp Business API: admin saves settings, test message, automatic reminder once', async () => {
    const { createServer } = await import('node:http');
    const calls: { path: string; auth: string; body: Record<string, unknown> }[] = [];
    let fail = false;
    const meta = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        calls.push({
          path: req.url || '',
          auth: req.headers.authorization || '',
          body: JSON.parse(raw),
        });
        res.statusCode = fail ? 400 : 200;
        res.setHeader('content-type', 'application/json');
        res.end(
          fail
            ? '{"error":{"message":"Template name does not exist in the translation"}}'
            : '{"messages":[{"id":"wamid.1"}]}',
        );
      });
    });
    await new Promise<void>((resolve) => meta.listen(0, '127.0.0.1', resolve));
    process.env.WHATSAPP_API_URL = `http://127.0.0.1:${(meta.address() as { port: number }).port}`;
    try {
      const settings = {
        enabled: true,
        phoneNumberId: '1234567890',
        accessToken: 'secret-token-abcd',
        templateName: 'reminder_1h',
        language: 'ru',
      };
      expect((await call('/admin/whatsapp', 'PUT', settings, c1)).status).toBe(403);
      expect(
        (
          await call(
            '/admin/whatsapp',
            'PUT',
            { ...settings, accessToken: '', phoneNumberId: '' },
            admin,
          )
        ).status,
      ).toBe(400);
      expect((await call('/admin/whatsapp', 'PUT', settings, admin)).status).toBe(200);
      // An empty token keeps the saved one; the token itself is never sent back.
      const saved = await call('/admin/whatsapp', 'PUT', { ...settings, accessToken: '' }, admin);
      expect(JSON.stringify(saved.body)).not.toContain('secret-token');
      expect((saved.body as unknown as { tokenHint: string }).tokenHint).toBe('…abcd');

      const test = await call('/admin/whatsapp/test', 'POST', { phone: '8 777 000 11 22' }, admin);
      expect(test.body).toEqual({ ok: true });
      expect(calls[0].path).toBe('/1234567890/messages');
      expect(calls[0].auth).toBe('Bearer secret-token-abcd');
      expect(calls[0].body).toMatchObject({
        messaging_product: 'whatsapp',
        to: '77770001122',
        type: 'template',
        template: { name: 'reminder_1h', language: { code: 'ru' } },
      });
      fail = true;
      const failed = await call('/admin/whatsapp/test', 'POST', { phone: '87770001122' }, admin);
      expect(failed.body).toEqual({
        ok: false,
        error: 'Template name does not exist in the translation',
      });

      const startsAt = new Date(Math.ceil(Date.now() / 60000 + 30) * 60000);
      const visit = await db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: 'Динара',
          guestPhone: '+7 701 222 33 44',
          serviceName: 'Тестовая стрижка',
          priceMinor: 500000,
          durationMinutes: 60,
          bufferAfterMinutes: 15,
          startsAt,
          endsAt: new Date(+startsAt + 3600000),
          occupiedUntil: new Date(+startsAt + 75 * 60000),
        },
      });
      const toClient = () => calls.filter((c) => c.body.to === '77012223344');
      // Meta refuses: the error is stored and the next run tries again.
      await call('/cron/reminders');
      let row = await db.appointment.findUniqueOrThrow({ where: { id: visit.id } });
      expect(row.waSentAt).toBe(null);
      expect(row.waError).toContain('Template name does not exist');
      fail = false;
      await call('/cron/reminders');
      await call('/cron/reminders');
      row = await db.appointment.findUniqueOrThrow({ where: { id: visit.id } });
      expect(toClient()).toHaveLength(2);
      expect(row.waSentAt).not.toBe(null);
      expect(row.remindedAt).not.toBe(null);
      expect(row.waError).toBe(null);
      const params = (
        toClient()[1].body.template as { components: { parameters: { text: string }[] }[] }
      ).components[0].parameters.map((p) => p.text);
      expect(params[0]).toBe('Динара');
      expect(params[1]).toMatch(/^сегодня в \d{2}:\d{2}$/);
      expect(params[2]).toBe('Тестовая стрижка');
      await db.appointment.update({
        where: { id: visit.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    } finally {
      await db.setting.deleteMany({ where: { key: 'whatsapp' } });
      delete process.env.WHATSAPP_API_URL;
      meta.close();
    }
  });
  it('review requests and «пора подстричься» lists; automatic templates via WhatsApp API', async () => {
    const { createServer } = await import('node:http');
    const calls: {
      to: string;
      template: { name: string; components: { parameters: { text: string }[] }[] };
    }[] = [];
    const meta = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        calls.push(JSON.parse(raw));
        res.setHeader('content-type', 'application/json').end('{"messages":[{"id":"x"}]}');
      });
    });
    await new Promise<void>((resolve) => meta.listen(0, '127.0.0.1', resolve));
    process.env.WHATSAPP_API_URL = `http://127.0.0.1:${(meta.address() as { port: number }).port}`;
    const tag = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const phone = (n: number) => `+7 70${n} ${tag.slice(0, 3)} ${tag.slice(3)} 0`;
    const created: string[] = [];
    const visit = async (
      n: number,
      hoursAgo: number,
      status: 'COMPLETED' | 'CONFIRMED',
      extra = {},
    ) => {
      const startsAt = new Date(Math.floor(Date.now() / 60000 - hoursAgo * 60) * 60000);
      const a = await db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: `Клиент ${n}`,
          guestPhone: phone(n),
          serviceName: 'Тестовая стрижка',
          priceMinor: 500000,
          durationMinutes: 30,
          bufferAfterMinutes: 0,
          startsAt,
          endsAt: new Date(+startsAt + 30 * 60000),
          occupiedUntil: new Date(+startsAt + 30 * 60000),
          status,
          ...extra,
        },
      });
      created.push(a.id);
      return a;
    };
    const weeks6 = 6 * 7 * 24;
    try {
      expect(
        (await call('/admin/growth', 'PUT', { reviewUrl: 'http://x', returnWeeks: 5 }, admin))
          .status,
      ).toBe(400);
      expect(
        (
          await call(
            '/admin/growth',
            'PUT',
            { reviewUrl: 'https://2gis.kz/firm/1', returnWeeks: 5 },
            admin,
          )
        ).status,
      ).toBe(200);
      const reviewed = await visit(1, 3, 'COMPLETED');
      const away = await visit(2, weeks6, 'COMPLETED');
      await visit(3, weeks6 + 1, 'COMPLETED');
      await visit(3, -50, 'CONFIRMED'); // already booked again
      await visit(4, weeks6 + 2, 'COMPLETED', { invitedAt: new Date() });
      await visit(5, 24 * 7, 'COMPLETED'); // recent visit: not due yet
      type Lists = {
        reviews: { id: string; text: string }[];
        returns: { id: string; guestPhone: string; text: string }[];
      };
      const lists = async () =>
        (await call('/admin/growth', 'GET', undefined, admin)).body as unknown as Lists;
      let l = await lists();
      expect(l.reviews.map((r) => r.id)).toContain(reviewed.id);
      expect(l.reviews.find((r) => r.id === reviewed.id)?.text).toContain('https://2gis.kz/firm/1');
      const mine = (r: { guestPhone: string }) => r.guestPhone.includes(tag.slice(3));
      expect(l.returns.filter(mine).map((r) => r.id)).toEqual([away.id]);
      expect(l.returns.find((r) => r.id === away.id)?.text).toContain('/book');
      expect((await call(`/admin/appointments/${away.id}/invited`, 'PATCH', {}, c1)).status).toBe(
        403,
      );
      expect(
        (await call(`/admin/appointments/${away.id}/invited`, 'PATCH', {}, admin)).status,
      ).toBe(200);
      l = await lists();
      expect(l.returns.filter(mine)).toHaveLength(0);

      // Automatic: the review template goes out once per visit.
      await call(
        '/admin/whatsapp',
        'PUT',
        {
          enabled: true,
          phoneNumberId: '1',
          accessToken: 'token',
          templateName: 'reminder_1h',
          reviewTemplate: 'review_request',
          returnTemplate: '',
          language: 'ru',
        },
        admin,
      );
      await call('/cron/reminders');
      await call('/cron/reminders');
      const toReviewed = calls.filter(
        (c) => c.to === '7701' + tag.slice(0, 3) + tag.slice(3) + '0',
      );
      expect(toReviewed).toHaveLength(1);
      expect(toReviewed[0].template.name).toBe('review_request');
      expect(toReviewed[0].template.components[0].parameters.map((p) => p.text)).toEqual([
        'Клиент 1',
        'https://2gis.kz/firm/1',
      ]);
      expect(
        (await db.appointment.findUniqueOrThrow({ where: { id: reviewed.id } })).reviewRequestedAt,
      ).not.toBe(null);
    } finally {
      await db.appointment.updateMany({
        where: { id: { in: created } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await db.setting.deleteMany({ where: { key: { in: ['whatsapp', 'growth'] } } });
      delete process.env.WHATSAPP_API_URL;
      meta.close();
    }
  });
  it('records payments and reports revenue, services and clients for a period', async () => {
    const day = Temporal.PlainDate.from(salonDate(new Date(), 'Asia/Almaty')).subtract({
      days: 400,
    });
    const date = day.toString();
    const tag = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const created: string[] = [];
    const visit = async (time: string, n: number, extra: Record<string, unknown> = {}) => {
      const startsAt = localInstant(date, time, 'Asia/Almaty');
      const a = await db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: `Касса ${n}`,
          guestPhone: `+7 702 ${tag} ${n}`.slice(0, 20),
          serviceName: n === 3 ? 'Укладка' : 'Тестовая стрижка',
          priceMinor: 250000,
          durationMinutes: 30,
          bufferAfterMinutes: 0,
          startsAt,
          endsAt: new Date(+startsAt + 30 * 60000),
          occupiedUntil: new Date(+startsAt + 30 * 60000),
          ...extra,
        },
      });
      created.push(a.id);
      return a;
    };
    try {
      const paid = await visit('10:00', 1);
      const kaspi = await visit('11:00', 2, { status: 'COMPLETED' });
      await visit('12:00', 3, { status: 'COMPLETED' }); // no payment recorded: list price counts
      await visit('13:00', 4, { status: 'NO_SHOW' });
      const pay = (id: string, body: unknown, cookie = admin) =>
        call(`/admin/appointments/${id}/payment`, 'PATCH', body, cookie);
      expect((await pay(paid.id, { paidMinor: 300000, paymentMethod: 'CASH' }, c1)).status).toBe(
        403,
      );
      expect((await pay(paid.id, { paidMinor: -1, paymentMethod: 'CASH' })).status).toBe(400);
      expect((await pay(paid.id, { paidMinor: 300000, paymentMethod: 'CARD' })).status).toBe(400);
      const r = await pay(paid.id, { paidMinor: 300000, paymentMethod: 'CASH' });
      expect(r.body.status).toBe('COMPLETED');
      await pay(kaspi.id, { paidMinor: 400000, paymentMethod: 'KASPI' });
      // A future visit cannot be paid yet.
      const ahead = new Date(Math.ceil(Date.now() / 60000 + 600 * 24 * 60) * 60000);
      const future = await db.appointment.create({
        data: {
          masterId: master2,
          serviceId: service,
          guestName: 'Будущий',
          serviceName: 'Тестовая стрижка',
          priceMinor: 250000,
          durationMinutes: 30,
          bufferAfterMinutes: 0,
          startsAt: ahead,
          endsAt: new Date(+ahead + 30 * 60000),
          occupiedUntil: new Date(+ahead + 30 * 60000),
        },
      });
      created.push(future.id);
      expect((await pay(future.id, { paidMinor: 1, paymentMethod: 'CASH' })).status).toBe(409);

      const s = (await call(`/admin/stats?from=${date}&to=${date}`, 'GET', undefined, admin))
        .body as unknown as Record<string, unknown> & {
        services: { name: string; visits: number }[];
      };
      expect(s).toMatchObject({
        completed: 3,
        noShows: 1,
        revenueMinor: 300000 + 400000 + 250000,
        cashMinor: 300000,
        kaspiMinor: 400000,
        unpaid: 1,
        clients: 3,
        newClients: 3,
        noShowRate: 0.25,
      });
      expect(s.services[0]).toMatchObject({ name: 'Тестовая стрижка', visits: 2 });
      expect(
        (await call('/admin/stats?from=2026-02-01&to=2026-01-01', 'GET', undefined, admin)).status,
      ).toBe(400);
      expect((await call('/admin/stats', 'GET', undefined, c1)).status).toBe(403);
    } finally {
      await db.appointment.deleteMany({ where: { id: { in: created } } });
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
