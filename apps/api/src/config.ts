import 'dotenv/config';
export const config = {
  name: process.env.SALON_NAME || 'FORMA',
  currency: process.env.SALON_CURRENCY || 'KZT',
  timezone: process.env.SALON_TIMEZONE || 'Asia/Almaty',
  origin: process.env.APP_ORIGIN || 'http://localhost:5173',
  address: process.env.SALON_ADDRESS || 'Демонстрационный салон · Алматы',
  contact: process.env.SALON_CONTACT || 'hello@forma.example',
  hours: process.env.SALON_HOURS || 'Ежедневно · 10:00–19:00',
  demo: process.env.DEMO_MODE === 'true',
  production: process.env.NODE_ENV === 'production',
};
new Intl.DateTimeFormat('ru', { timeZone: config.timezone }).format();
