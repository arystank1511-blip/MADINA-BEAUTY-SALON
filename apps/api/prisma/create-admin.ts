import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/auth';
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    name = process.env.ADMIN_NAME,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !email.includes('@') || !name || !password || password.length < 14)
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (at least 14 characters).');
  await db.user.create({
    data: { email, name, passwordHash: await hashPassword(password), role: 'ADMIN' },
  });
  console.log('Administrator created.');
}
main()
  .finally(() => db.$disconnect())
  .catch(() => {
    console.error(
      'Administrator was not created. Check inputs and whether the email already exists.',
    );
    process.exitCode = 1;
  });
