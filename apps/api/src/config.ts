import 'dotenv/config';
export const config = {
  name: process.env.SALON_NAME || 'Мадина',
  currency: process.env.SALON_CURRENCY || 'KZT',
  timezone: process.env.SALON_TIMEZONE || 'Asia/Almaty',
  origin:
    process.env.APP_ORIGIN ||
    (process.env.VERCEL === '1' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:5173'),
  address: process.env.SALON_ADDRESS || 'Адрес салона уточняется',
  contact: process.env.SALON_CONTACT || 'Контакты салона уточняются',
  hours: process.env.SALON_HOURS || 'Ежедневно · 10:00–19:00',
  demo: process.env.DEMO_MODE === 'true',
  production: process.env.NODE_ENV === 'production',
};
new Intl.DateTimeFormat('ru', { timeZone: config.timezone }).format();

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (origin === config.origin) return true;
  if (process.env.VERCEL !== '1') return false;
  // Only platform-provided URLs for this project; never a request Host or wildcard suffix.
  return [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].some((host) => host && origin === `https://${host}`);
}
