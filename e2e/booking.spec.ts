import { expect, Page, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const widths = [375, 768, 1440];
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@forma.example');
  await page.getByLabel('Пароль', { exact: true }).fill('FormaDemo2026!');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  // Staff land on the master's day view.
  await expect(page.getByRole('heading', { name: 'Мой день' })).toBeVisible();
}
async function pickSlot(page: Page, daysAhead: number) {
  // The salon has a single master, so choosing a service goes straight to the calendar.
  await page.getByRole('button', { name: /Мужская стрижка/ }).click();
  await expect(page.getByRole('heading', { name: 'Когда вам удобно?' })).toBeVisible();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  // Sunday is the salon's day off: no slots.
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  const day = date.toISOString().slice(0, 10);
  await page.getByLabel('Дата посещения').fill(day);
  await expect(page.locator('.slots button').first()).toBeVisible();
  return day;
}
test('malformed booking URL remains usable', async ({ page }) => {
  await page.goto('/book?date=bad&time=bad&step=2.5');
  await expect(page.getByRole('heading', { name: 'Время для себя.' })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByRole('heading', { name: 'Выберите услугу' })).toBeVisible();
  await page.goto('/login?returnTo=http%3A%2F%2F%5B');
  await expect(page.getByRole('heading', { name: 'С возвращением.' })).toBeVisible();
});
test('guest books through WhatsApp without an account; responsive screenshots', async ({
  page,
}) => {
  await mkdir('docs/screenshots', { recursive: true });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Красота начинается с вас.' })).toBeVisible();
    await expect(page.locator('.service-row').first()).toBeVisible();
    await expect(page.locator('header')).not.toContainText('Войти');
    await expect(page.locator('#masters')).toContainText('Нургуль');
    await expect(page.locator('#masters')).not.toContainText('Люба');
    await page.screenshot({ path: `docs/screenshots/home-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/book');
  await pickSlot(page, 5);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `docs/screenshots/booking-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.locator('.slots button').first().click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await page.getByLabel('Ваше имя').fill('Анна');
  await page.getByLabel('Телефон (WhatsApp)').fill('+7 701 000 00 00');
  // «Записаться» holds the time and goes straight to WhatsApp with the ready message.
  await page.route('https://wa.me/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<p>WhatsApp</p>' }),
  );
  const request = page.waitForResponse('**/api/v1/booking-requests');
  await page.getByRole('button', { name: 'Записаться', exact: true }).click();
  const response = await request;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ name: 'Анна' });
  await page.waitForURL('https://wa.me/**');
  const href = page.url();
  expect(href.startsWith('https://wa.me/77767296558?text=')).toBe(true);
  // Coming back from WhatsApp shows the confirmation, not the form again.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Остался один шаг.' })).toBeVisible();
  const text = decodeURIComponent(new URL(href).searchParams.get('text') ?? '');
  expect(text).toContain('Мужская стрижка');
  expect(text).toContain('Нургуль');
  expect(text).toContain('Меня зовут Анна.');
  // The request holds the slot: it is no longer offered to the next visitor.
  const stored = await page.evaluate(() => sessionStorage.getItem('booking-sent'));
  const { id, startsAt } = (
    JSON.parse(stored || '{}') as { visits: { id: string; startsAt: string }[] }
  ).visits[0];
  await page.goto('/book');
  await pickSlot(page, 5);
  const held = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startsAt));
  await expect(page.locator('.slots button', { hasText: held })).toHaveCount(0);
  await login(page);
  const origin = new URL(page.url()).origin;
  await page.request.patch(`/api/v1/admin/appointments/${id}/cancel`, {
    headers: { Origin: origin, 'X-CSRF-Protection': '1' },
    data: {},
  });
});
test('admin changes a service price inline and edits working hours; no page overflow', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin');
  await expect(page.locator('table')).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `docs/screenshots/admin-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Мастера', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Нургуль');
  await expect(page.locator('tbody')).not.toContainText(/Люба|Алина|Тимур|София/);
  await page.getByRole('button', { name: 'Услуги', exact: true }).click();
  const row = page.locator('tbody tr').first();
  const price = row.getByRole('spinbutton');
  const original = await price.inputValue();
  await price.fill('6100');
  await row.getByRole('button', { name: /Сохранить цену/ }).click();
  await expect(row.getByRole('status')).toContainText('Цена обновлена');
  await page.goto('/services');
  await expect(page.locator('.service-row').first()).toContainText('6 100');
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Услуги', exact: true }).click();
  await page.locator('tbody tr').first().getByRole('spinbutton').fill(original);
  await page
    .locator('tbody tr')
    .first()
    .getByRole('button', { name: /Сохранить цену/ })
    .click();
  await expect(page.locator('tbody tr').first().getByRole('status')).toBeVisible();
  await page.getByRole('button', { name: 'Расписание', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить часы' }).click();
  await expect(page.getByRole('status')).toContainText('Расписание сохранено');
});
test('former account pages redirect to booking and 404 has working navigation', async ({
  page,
}) => {
  await page.goto('/my');
  await expect(page.getByRole('heading', { name: 'Время для себя.' })).toBeVisible();
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Время для себя.' })).toBeVisible();
  await page.goto('/missing-page');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.getByRole('link', { name: /На главную/ }).click();
  await expect(page.locator('.hero h1')).toBeVisible();
});

test('admin booking: a newly occupied slot resets only the time', async ({ page }) => {
  await login(page);
  await page.goto('/admin/new');
  const day = await pickSlot(page, 8);
  await page.locator('.slots button').first().click();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  const customer = page.getByLabel('Клиент');
  await expect(customer.locator('option')).not.toHaveCount(1);
  await customer.selectOption({ index: 1 });
  const selected = new URL(page.url()).searchParams;
  const headers = { Origin: new URL(page.url()).origin, 'X-CSRF-Protection': '1' };
  const competing = await page.request.post('/api/v1/admin/appointments', {
    headers,
    data: {
      serviceId: selected.get('service'),
      masterId: selected.get('master'),
      startsAt: selected.get('time'),
      customerId: await customer.inputValue(),
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
    await page.request.patch(`/api/v1/admin/appointments/${id}/cancel`, { headers, data: {} });
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
  await expect(page.getByRole('heading', { name: 'Когда вам удобно?' })).toBeVisible();
});

test('master day: book a walk-in, confirm a site request, cancel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await expect(page.locator('.md-free').first()).toBeVisible();
  const name = `Сауле ${Date.now() % 10000}`;
  await page.locator('.md-free').first().click();
  await page.getByLabel('Имя клиента').fill(name);
  await page.getByLabel('Телефон (если есть)').fill('87772223344');
  await page.getByRole('button', { name: '✓ Записать' }).click();
  const card = page.locator('.md-card').filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card.getByRole('link', { name: /Позвонить/ })).toHaveAttribute(
    'href',
    'tel:+77772223344',
  );
  const remind = await card.getByRole('link', { name: /Напомнить/ }).getAttribute('href');
  expect(remind?.startsWith('https://wa.me/77772223344?text=')).toBe(true);
  expect(decodeURIComponent(remind!.split('?text=')[1])).toContain('завтра');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // A request from the site appears at the top and is confirmed with one tap.
  const day = await page.request.get(
    '/api/v1/admin/day?date=' + new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
  );
  const data = await day.json();
  const serviceId = data.services[0].id;
  const slot = data.fits[serviceId].at(-1);
  const guest = `Гость ${Date.now() % 10000}`;
  const origin = new URL(page.url()).origin;
  const created = await page.request.post('/api/v1/booking-requests', {
    headers: { Origin: origin, 'X-CSRF-Protection': '1' },
    data: {
      serviceId,
      masterId: data.master.id,
      startsAt: slot,
      name: guest,
      phone: '+7 701 000 00 01',
    },
  });
  expect(created.status()).toBe(201);
  await page.reload();
  const pending = page.locator('.md-pending .md-card').filter({ hasText: guest });
  await expect(pending).toBeVisible();
  await pending.getByRole('button', { name: /Подтвердить/ }).click();
  await expect(pending).toHaveCount(0);
  // Cancel the walk-in; its time becomes free again.
  await page.getByRole('button', { name: 'Завтра', exact: true }).click();
  await card.getByRole('button', { name: 'Отменить запись' }).click();
  await page.getByRole('button', { name: 'Да, отменить' }).click();
  await expect(card).toHaveCount(0);
  const { id } = await created.json();
  await page.request.patch(`/api/v1/admin/appointments/${id}/cancel`, {
    headers: { Origin: origin, 'X-CSRF-Protection': '1' },
    data: {},
  });
});
