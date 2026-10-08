import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/auth';

/**
 * One-time hand-over of the administrator login from secret env variables.
 * Runs on every production deploy but only acts while no account uses ADMIN_EMAIL yet,
 * so a password changed later in the admin panel is never overwritten.
 */
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('sync-admin: ADMIN_EMAIL/ADMIN_PASSWORD not set, skipped');
    return;
  }
  if (!email.includes('@') || password.length < 10)
    throw new Error('sync-admin: ADMIN_EMAIL must be an email and ADMIN_PASSWORD 10+ characters');
  const db = new PrismaClient();
  try {
    if (await db.user.findUnique({ where: { email } })) {
      console.log('sync-admin: administrator already set up, nothing to do');
      return;
    }
    const data = { email, passwordHash: await hashPassword(password), role: 'ADMIN' as const };
    const current = await db.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
    });
    if (current) {
      // Replaces the demo login; every old session is signed out.
      await db.$transaction([
        db.user.update({ where: { id: current.id }, data }),
        db.session.deleteMany({ where: { userId: current.id } }),
      ]);
    } else await db.user.create({ data: { ...data, name: 'Администратор' } });
    console.log('sync-admin: administrator login updated');
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
