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
    ['Мужской зал', 'Нулевка', 'Машинкой под ноль.', 20, 10, 100000, false],
    [
      'Мужской зал',
      'Детская стрижка (1–15 лет)',
      'Аккуратная стрижка для мальчиков от 1 года до 15 лет.',
      30,
      10,
      200000,
      false,
    ],
    ['Мужской зал', 'Мужская стрижка (от 15 лет)', 'С мытьём головы.', 30, 10, 250000, true],
    [
      'Мужской зал',
      'Креативная стрижка',
      'Цезарь, удлинённая и другие модельные стрижки.',
      40,
      10,
      300000,
      true,
    ],
    ['Мужской зал', 'Покраска', 'Окрашивание волос.', 60, 10, 200000, true],
    ['Мужской зал', 'Окантовка', 'Аккуратный контур.', 20, 10, 200000, true],
    ['Мужской зал', 'Стрижка под насадки', 'Машинкой под насадку.', 20, 10, 150000, true],
    ['Мужской зал', 'Химзавивка на короткие волосы', '', 90, 10, 500000, true],
    ['Мужской зал', 'Химзавивка на удлинённые волосы', '', 120, 10, 600000, true],
    ['Мужской зал', 'Мытьё головы', 'Цена зависит от длины и густоты волос.', 10, 5, 30000, true],
    ['Мужской зал', 'Укладка', '', 20, 10, 50000, true],
    ['Женский зал', 'Чёлка', 'Стрижка чёлки.', 15, 5, 50000, true],
    ['Женский зал', 'Детская стрижка', '', 30, 10, 150000, true],
    ['Женский зал', 'Стрижка на короткие волосы', '', 40, 10, 250000, true],
    [
      'Женский зал',
      'Стрижка на удлинённые волосы',
      'Каре, каприз, каскад и другие.',
      50,
      10,
      300000,
      true,
    ],
    ['Женский зал', 'Стрижка на длинные волосы', '', 60, 10, 350000, true],
    ['Женский зал', 'Кончики по всей длине', 'Подравнивание кончиков волос.', 30, 10, 300000, true],
    ['Женский зал', 'Мытьё коротких волос', '', 15, 5, 50000, true],
    ['Женский зал', 'Мытьё удлинённых волос', '', 20, 5, 100000, true],
    ['Женский зал', 'Сушка коротких волос', '', 15, 5, 50000, true],
    ['Женский зал', 'Сушка удлинённых волос', '', 20, 5, 100000, true],
    ['Женский зал', 'Сушка и укладка', '', 30, 10, 100000, true],
    ['Женский зал', 'Мелирование', '', 120, 10, 500000, true],
    ['Женский зал', 'Химзавивка на короткие волосы', '', 120, 10, 500000, true],
    ['Женский зал', 'Химзавивка на удлинённые волосы', '', 150, 10, 600000, true],
    ['Женский зал', 'Покраска коротких волос', '', 90, 10, 250000, true],
    ['Женский зал', 'Локоны', '', 60, 10, 500000, true],
    ['Женский зал', 'Пряди', 'Окрашивание прядей.', 90, 10, 300000, true],
    ['Женский зал', 'Укладка', 'Вечерняя или праздничная укладка.', 60, 10, 300000, true],
  ] as const;
  for (const [i, s] of services.entries())
    await db.service.upsert({
      // Same ids as the price-list migration, which has usually created them already.
      where: { id: id(40 + i) },
      update: {},
      create: {
        id: id(40 + i),
        category: s[0],
        name: s[1],
        description: s[2],
        durationMinutes: s[3],
        bufferAfterMinutes: s[4],
        priceMinor: s[5],
        priceFrom: s[6],
      },
    });
  const masters = [
    ['Нургуль', 'Мастер салона «Мадина».', '/images/nurgul.webp', services.map((_, i) => 40 + i)],
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
        // Monday to Saturday; Sunday is the day off.
        workingHours: {
          create: Array.from({ length: 6 }, (_, day) => ({
            weekday: day + 1,
            startTime: '10:00',
            endTime: '18:00',
          })),
        },
        breaks: {
          create: Array.from({ length: 6 }, (_, day) => ({
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
        endsAt: localInstant(today.add({ days: 12 }).toString(), '18:00', zone),
        reason: 'Демонстрационный выходной',
      },
    });
  for (const [i, days, status] of [
    [40, 2, 'CONFIRMED'],
    [41, -3, 'COMPLETED'],
    [42, 3, 'CANCELLED'],
  ] as const) {
    if (await db.appointment.findUnique({ where: { id: id(i) } })) continue;
    const s = await db.service.findUniqueOrThrow({ where: { id: id(42) } });
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
