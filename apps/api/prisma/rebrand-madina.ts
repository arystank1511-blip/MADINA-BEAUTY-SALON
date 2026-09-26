import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function rebrand() {
  if (process.env.MADINA_REBRAND_APPLY !== 'true')
    throw new Error('Set MADINA_REBRAND_APPLY=true to apply the one-time master change.');

  const result = await db.$transaction(async (tx) => {
    const services = await tx.service.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (!services.length) throw new Error('No active services are available for the new masters.');

    const created: string[] = [];
    for (const [number, name] of [
      [23, 'Нургуль'],
      [24, 'Люба'],
    ] as const) {
      if (await tx.master.findUnique({ where: { id: id(number) } })) continue;
      await tx.master.create({
        data: {
          id: id(number),
          name,
          description: 'Мастер салона «Мадина».',
          services: { create: services.map((service) => ({ serviceId: service.id })) },
          workingHours: {
            create: Array.from({ length: 7 }, (_, weekday) => ({
              weekday: weekday + 1,
              startTime: '10:00',
              endTime: '19:00',
            })),
          },
          breaks: {
            create: Array.from({ length: 7 }, (_, weekday) => ({
              weekday: weekday + 1,
              startTime: '13:00',
              endTime: '14:00',
            })),
          },
        },
      });
      created.push(name);
    }

    // Keep historic appointments linked to their original masters.
    const hidden = await tx.master.updateMany({
      where: { id: { in: [id(20), id(21), id(22)] }, isActive: true },
      data: { isActive: false },
    });
    return { created, hidden: hidden.count };
  });
  console.log(
    `Madina masters ready: ${result.created.join(', ') || 'already present'}; hidden legacy profiles: ${result.hidden}.`,
  );
}

rebrand()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
