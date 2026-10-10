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
  address: process.env.SALON_ADDRESS || 'с. Зеренда, ул. Тауелсиздик, 68, Акмолинская область',
  contact: process.env.SALON_CONTACT || 'WhatsApp +7 776 729 65 58',
  hours: process.env.SALON_HOURS || 'Ежедневно · 10:00–18:00',
  // Digits only, international format without '+': used for wa.me links.
  payment: process.env.SALON_PAYMENT || 'Наличные · Kaspi QR',
  // 2GIS card of the salon: address, map and route.
  map: process.env.SALON_MAP_URL || 'https://2gis.kz/kokshetau/firm/70000001054384638',
  whatsapp: (process.env.SALON_WHATSAPP || '77767296558').replace(/\D/g, ''),
  // Public address used in messages to clients (links to booking).
  siteUrl: `https://${process.env.PUBLIC_HOST || 'madina-salon.vercel.app'}`,
  demo: process.env.DEMO_MODE === 'true',
  production: process.env.NODE_ENV === 'production',
};
new Intl.DateTimeFormat('ru', { timeZone: config.timezone }).format();

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (origin === config.origin) return true;
  if (process.env.VERCEL !== '1') return false;
  // Only platform-provided URLs for this project and its public domain;
  // never a request Host or wildcard suffix.
  return [
    process.env.PUBLIC_HOST || 'madina-salon.vercel.app',
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].some((host) => host && origin === `https://${host}`);
}
