import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('malformed booking URL remains usable', async ({ page }) => {
  await page.goto('/book?date=bad&time=bad&step=2.5');
  await expect(page.getByRole('heading', { name: 'Время для себя.' })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole('heading', { name: 'Выберите услугу' })).toBeVisible();
  await page.goto('/login?returnTo=http%3A%2F%2F%5B');
  await expect(page.getByRole('heading', { name: 'С возвращением.' })).toBeVisible();
});
const widths = [375, 768, 1440];
test('client books through real API, sees visit and cancels; responsive screenshots', async ({
  page,
}) => {
  await mkdir('docs/screenshots', { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Красота начинается с вас.' })).toBeVisible();
    await expect(page.locator('.service-row').first()).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/home-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('client@forma.example');
  await page.getByLabel('Пароль', { exact: true }).fill('FormaDemo2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои записи.' })).toBeVisible();
  await page.getByRole('link', { name: 'Новая запись' }).click();
  await page.getByRole('button', { name: /Мужская стрижка/ }).click();
  await page.getByRole('button', { name: /Нургуль/ }).click();
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 5);
  await page.getByLabel('Дата посещения').fill(day.toISOString().slice(0, 10));
  await expect(page.locator('.slots button').first()).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `docs/screenshots/booking-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.locator('.slots button').first().click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить запись' }).click();
  await expect(page.getByRole('heading', { name: 'Вы записаны.' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Мои записи' }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `docs/screenshots/account-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const card = page
    .locator('.appointment-card')
    .filter({ hasText: 'Мужская стрижка' })
    .filter({ has: page.getByRole('button', { name: 'Отменить' }) })
    .first();
  await card.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Да, отменить' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Запись отменена' })).toBeVisible();
});
test('admin edits a real service and working hours; no page overflow', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@forma.example');
  await page.getByLabel('Пароль', { exact: true }).fill('FormaDemo2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои записи.' })).toBeVisible();
  await page.goto('/admin');
  await expect(page.locator('table')).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `docs/screenshots/admin-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Услуги', exact: true }).click();
  await page.locator('tbody tr').first().getByRole('button', { name: 'Изменить' }).click();
  await page.getByLabel('Цена (KZT)').fill('6100');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('6 100');
  await page.locator('tbody tr').first().getByRole('button', { name: 'Изменить' }).click();
  await page.getByLabel('Цена (KZT)').fill('6000');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Расписание', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить часы' }).click();
  await expect(page.getByRole('status')).toContainText('Расписание сохранено');
});
test('guest selection survives login and 404 has working navigation', async ({ page }) => {
  await page.goto('/book');
  await page.getByRole('button', { name: /Мужская стрижка/ }).click();
  await page.getByRole('button', { name: /Нургуль/ }).click();
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 6);
  await page.getByLabel('Дата посещения').fill(day.toISOString().slice(0, 10));
  await page.locator('.slots button').first().click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByRole('link', { name: 'Войти и продолжить' }).click();
  await page.getByLabel('Email', { exact: true }).fill('anna@forma.example');
  await page.getByLabel('Пароль', { exact: true }).fill('FormaDemo2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Подтвердить запись' })).toBeVisible();
  await expect(page.locator('.review')).toContainText('Нургуль');
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.getByRole('link', { name: /На главную/ }).click();
  await expect(page.locator('.hero h1')).toBeVisible();
});

test('a newly occupied slot resets only the time and refreshes availability', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('anna@forma.example');
  await page.getByLabel('Пароль', { exact: true }).fill('FormaDemo2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Мои записи.' })).toBeVisible();
  await page.goto('/book');
  await page.getByRole('button', { name: /Мужская стрижка/ }).click();
  await page.getByRole('button', { name: /Нургуль/ }).click();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 8);
  const day = date.toISOString().slice(0, 10);
  await page.getByLabel('Дата посещения').fill(day);
  await page.locator('.slots button').first().click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const selected = new URL(page.url()).searchParams;
  const headers = { Origin: new URL(page.url()).origin, 'X-CSRF-Protection': '1' };
  const competing = await page.request.post('/api/v1/appointments', {
    headers,
    data: {
      serviceId: selected.get('service'),
      masterId: selected.get('master'),
      startsAt: selected.get('time'),
    },
  });
  expect(competing.status()).toBe(201);
  const { id } = await competing.json();
  try {
    await page.getByRole('button', { name: 'Подтвердить запись' }).click();
    await expect(page.getByRole('alert')).toContainText('Это время уже занято');
    await expect(page.getByRole('heading', { name: 'Когда вам удобно?' })).toBeVisible();
    await expect(page.getByLabel('Дата посещения')).toHaveValue(day);
    const after = new URL(page.url()).searchParams;
    expect(after.get('service')).toBe(selected.get('service'));
    expect(after.get('master')).toBe(selected.get('master'));
    expect(after.has('time')).toBe(false);
    await expect(page.locator('.slots button[aria-pressed=true]')).toHaveCount(0);
  } finally {
    await page.request.patch(`/api/v1/appointments/${id}/cancel`, { headers, data: {} });
  }
});

test('mobile menu supports Escape; booking reflows at 200 percent', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.locator('header nav').getByRole('link', { name: 'Услуги', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeFocused();
  // Browser zoom at 200% gives a 720x500 CSS viewport on a 1440x1000 display.
  // CSS `zoom` is not equivalent: it does not trigger responsive media queries.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 500,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await page.goto('/book');
  await expect(page.getByRole('button', { name: /Мужская стрижка/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: /Мужская стрижка/ }).click();
  await expect(page.getByRole('heading', { name: 'Выберите мастера' })).toBeVisible();
});
