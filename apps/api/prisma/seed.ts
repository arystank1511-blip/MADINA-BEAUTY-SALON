import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import { hashPassword } from '../src/auth/auth';
import { localInstant, salonDate } from '../src/availability/rules';
const db = new PrismaClient();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_MODE !== 'true')
    throw new Error('Demo seed requires DEMO_MODE=true and non-production NODE_ENV.');
  const passwordHash = await hashPassword('FormaDemo2026!');
  for (const [i, email, name, role] of [
    [1, 'admin@forma.example', 'Администратор', 'ADMIN'],
    [2, 'client@forma.example', 'Александр', 'CUSTOMER'],
    [3, 'anna@forma.example', 'Анна', 'CUSTOMER'],
  ] as const) {
    if (!(await db.user.findUnique({ where: { email } })))
      await db.user.create({ data: { id: id(i), email, name, role, passwordHash } });
  }
  const services = [
    [
      'Мужская стрижка',
      'Точная форма, чистые линии и укладка по вашему настроению.',
      30,
      10,
      600000,
    ],
    [
      'Женская стрижка — короткие волосы',
      'Выразительный силуэт и лёгкая повседневная укладка.',
      45,
      15,
      800000,
    ],
    [
      'Женская стрижка — длинные волосы',
      'Бережная работа с длиной, текстурой и естественным движением.',
      60,
      15,
      1100000,
    ],
    ['Детская стрижка', 'Спокойное знакомство со стрижкой и аккуратная форма.', 30, 10, 450000],
    ['Укладка', 'Объём, гладкость или мягкие волны для вашего события.', 45, 10, 700000],
    [
      'Окрашивание',
      'Однотонный цвет для волос средней длины. Включает уход и укладку.',
      150,
      15,
      2400000,
    ],
    ['Уход за волосами', 'Мягкое очищение и интенсивный уход по типу волос.', 60, 10, 1000000],
  ] as const;
  for (const [i, s] of services.entries())
    await db.service.upsert({
      where: { id: id(10 + i) },
      update: {},
      create: {
        id: id(10 + i),
        name: s[0],
        description: s[1],
        durationMinutes: s[2],
        bufferAfterMinutes: s[3],
        priceMinor: s[4],
      },
    });
  const masters = [
    ['Нургуль', 'Мастер салона «Мадина».', '/images/nurgul.webp', [10, 11, 12, 13, 14, 15, 16]],
  ] as const;
  for (const [i, m] of masters.entries()) {
    if (await db.master.findUnique({ where: { id: id(23 + i) } })) continue;
    await db.master.create({
      data: {
        id: id(23 + i),
        name: m[0],
        description: m[1],
        avatarUrl: m[2],
        services: { create: m[3].map((n) => ({ serviceId: id(n) })) },
        workingHours: {
          create: Array.from({ length: 7 }, (_, day) => ({
            weekday: day + 1,
            startTime: '10:00',
            endTime: '19:00',
          })),
        },
        breaks: {
          create: Array.from({ length: 7 }, (_, day) => ({
            weekday: day + 1,
            startTime: '13:00',
            endTime: '14:00',
          })),
        },
      },
    });
  }
  const zone = process.env.SALON_TIMEZONE || 'Asia/Almaty';
  const today = Temporal.PlainDate.from(salonDate(new Date(), zone));
  if (!(await db.timeOff.findUnique({ where: { id: id(30) } })))
    await db.timeOff.create({
      data: {
        id: id(30),
        masterId: id(23),
        startsAt: localInstant(today.add({ days: 12 }).toString(), '10:00', zone),
        endsAt: localInstant(today.add({ days: 12 }).toString(), '19:00', zone),
        reason: 'Демонстрационный выходной',
      },
    });
  for (const [i, days, status] of [
    [40, 2, 'CONFIRMED'],
    [41, -3, 'COMPLETED'],
    [42, 3, 'CANCELLED'],
  ] as const) {
    if (await db.appointment.findUnique({ where: { id: id(i) } })) continue;
    const s = await db.service.findUniqueOrThrow({ where: { id: id(10) } });
    const startsAt = localInstant(today.add({ days }).toString(), '10:00', zone);
    const endsAt = new Date(+startsAt + s.durationMinutes * 60000),
      occupiedUntil = new Date(+endsAt + s.bufferAfterMinutes * 60000);
    // Never overwrite real visits if a seed is rerun after people use the demo.
    if (
      await db.appointment.count({
        where: {
          masterId: id(23),
          status: { not: 'CANCELLED' },
          startsAt: { lt: occupiedUntil },
          occupiedUntil: { gt: startsAt },
        },
      })
    )
      continue;
    await db.appointment.create({
      data: {
        id: id(i),
        customerId: id(2),
        masterId: id(23),
        serviceId: s.id,
        startsAt,
        endsAt,
        occupiedUntil,
        status,
        serviceName: s.name,
        priceMinor: s.priceMinor,
        durationMinutes: s.durationMinutes,
        bufferAfterMinutes: s.bufferAfterMinutes,
        ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancelledById: id(2) } : {}),
      },
    });
  }
  console.log(
    'Demo ready. admin@forma.example / client@forma.example / anna@forma.example. Password: FormaDemo2026!',
  );
}
seed()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
