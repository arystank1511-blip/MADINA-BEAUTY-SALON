import { expect, test } from '@playwright/test';

test('Escape respects an in-flight cancellation, then closes and restores focus', async ({
  page,
}) => {
  const appointment = {
    id: 'test-appointment',
    masterId: 'test-master',
    customerId: 'test-customer',
    serviceName: 'Тестовая стрижка',
    priceMinor: 500000,
    durationMinutes: 60,
    startsAt: '2099-01-01T10:00:00Z',
    endsAt: '2099-01-01T11:00:00Z',
    occupiedUntil: '2099-01-01T11:15:00Z',
    status: 'CONFIRMED',
    master: { id: 'test-master', name: 'Тестовый мастер' },
    customer: {
      id: 'test-customer',
      name: 'Тестовый клиент',
      email: 'test@example.com',
      role: 'CUSTOMER',
    },
  };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/config'))
      return route.fulfill({
        json: {
          name: 'Мадина',
          currency: 'KZT',
          timezone: 'Asia/Almaty',
          address: '',
          contact: '',
          hours: '',
          whatsapp: '77767296558',
          demo: false,
        },
      });
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: { id: 'admin', name: 'Админ', email: 'admin@example.com', role: 'ADMIN' },
      });
    if (path.endsWith('/admin/masters')) return route.fulfill({ json: [] });
    if (path.endsWith('/admin/appointments'))
      return route.fulfill({ json: { items: [appointment], total: 1, page: 1, pageSize: 20 } });
    if (path.endsWith('/cancel')) {
      await pending;
      return route.fulfill({
        status: 503,
        json: { code: 'TEMPORARY', message: 'Попробуйте позже.' },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/admin');
  const opener = page.getByRole('button', { name: 'Отменить', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  try {
    await dialog.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(dialog.getByRole('button', { name: 'Подтвердить' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
    await expect(dialog).toBeVisible();
  } finally {
    release();
  }
  await expect(dialog.getByRole('alert')).toContainText('Попробуйте позже.');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Назад' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});
