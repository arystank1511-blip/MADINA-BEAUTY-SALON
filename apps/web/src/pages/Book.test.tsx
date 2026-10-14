import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { addDays, todayIn } from '../api';
import type { Appointment, Config, Master, Service, Slot, User } from '../api';
import { Book } from './Book';

const config: Config = {
  name: 'MADINA',
  currency: 'KZT',
  timezone: 'Asia/Almaty',
  address: '',
  contact: '',
  hours: '',
  payment: 'наличные или Kaspi',
  map: '',
  whatsapp: '77001234567',
  demo: false,
};

const service = (id: string, name: string): Service => ({
  id,
  category: 'Женский зал',
  name,
  description: '',
  priceMinor: 500000,
  priceFrom: false,
  durationMinutes: 60,
  bufferAfterMinutes: 0,
  isActive: true,
});
const haircut = service('s1', 'Стрижка');
const coloring = service('s2', 'Окрашивание');
const styling = service('s3', 'Укладка');

const master = (id: string, name: string, offers: Service[]): Master => ({
  id,
  name,
  description: 'Мастер',
  avatarUrl: null,
  isActive: true,
  services: offers.map((s) => ({ serviceId: s.id, service: s })),
});
// Haircut has two masters; coloring has only one, so the master step is skipped for it.
const masters = [
  master('m1', 'Айгерим', [haircut, styling]),
  master('m2', 'Сауле', [haircut]),
  master('m3', 'Дана', [coloring]),
];

const slot = (startsAt: string): Slot => ({ startsAt, endsAt: startsAt, occupiedUntil: startsAt });
const SLOT_10 = '2030-01-15T05:00:00.000Z';
const SLOT_11 = '2030-01-15T06:00:00.000Z';

type Reply = { status?: number; body: unknown };
type Handler = Reply | ((init: RequestInit | undefined, call: number) => Reply);

/** Routes fetch calls by "METHOD /path" (query string ignored) to canned replies. */
function mockApi(routes: Record<string, Handler>) {
  const calls: Record<string, number> = {};
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname.replace('/api/v1', '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    calls[key] = (calls[key] ?? 0) + 1;
    const reply = typeof handler === 'function' ? handler(init, calls[key]) : handler;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  globalThis.fetch = fetchMock as typeof fetch;
  return fetchMock;
}

const posted = (fetchMock: jest.Mock, path: string) => {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url).endsWith(path) && init?.method === 'POST',
  );
  return call && JSON.parse(call[1].body as string);
};

const baseRoutes: Record<string, Handler> = {
  'GET /services': { body: [haircut, coloring, styling] },
  'GET /masters': { body: masters },
  'GET /offers': { body: { loyalty: null, birthdayDiscount: null, referral: null } },
  'GET /promo': { body: { promo: null } },
  'GET /availability': { body: { slots: [slot(SLOT_10), slot(SLOT_11)] } },
};

function renderBook(url: string, admin = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/book" element={<Book config={config} admin={admin} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const timeStep = '/book?service=s1&master=m1&date=2030-01-15&step=3';
const reviewStep = `/book?service=s1&master=m1&date=2030-01-15&time=${SLOT_10}&step=4`;

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  // jsdom cannot navigate to WhatsApp; the redirect itself is not what these tests check.
  const consoleError = console.error;
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (String(args[0]).includes('Not implemented: navigation')) return;
    consoleError(...args);
  });
});

describe('Book page: choosing a service and master', () => {
  it('shows a loading state, then services grouped by hall', async () => {
    mockApi(baseRoutes);
    renderBook('/book');

    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Женский зал' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Стрижка/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Окрашивание/ })).toBeInTheDocument();
  });

  it('shows an error and lets the user retry when services fail to load', async () => {
    mockApi({
      ...baseRoutes,
      'GET /services': (_init, call) =>
        call === 1
          ? { status: 500, body: { code: 'INTERNAL', message: 'Сервер недоступен' } }
          : { body: [haircut] },
    });
    renderBook('/book');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
    await userEvent.click(screen.getByRole('button', { name: /Повторить загрузку/ }));
    expect(await screen.findByRole('button', { name: /Стрижка/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists only the masters who provide the chosen service', async () => {
    mockApi(baseRoutes);
    renderBook('/book');

    await userEvent.click(await screen.findByRole('button', { name: /Стрижка/ }));

    expect(screen.getByRole('heading', { name: 'Выберите мастера' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Айгерим/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сауле/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Дана/ })).not.toBeInTheDocument();
  });

  it('skips the master step when only one master provides the service', async () => {
    mockApi(baseRoutes);
    renderBook('/book');

    await userEvent.click(await screen.findByRole('button', { name: /Окрашивание/ }));

    expect(screen.getByRole('heading', { name: 'Когда вам удобно?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Выберите мастера' })).not.toBeInTheDocument();
  });
});

describe('Book page: choosing a time', () => {
  it('keeps «Продолжить» disabled until a time slot is selected', async () => {
    mockApi(baseRoutes);
    renderBook(timeStep);

    const slots = within(await screen.findByLabelText('Свободное время')).getAllByRole('button');
    expect(slots).toHaveLength(2);
    const next = screen.getByRole('button', { name: /Продолжить/ });
    expect(next).toBeDisabled();

    await userEvent.click(slots[0]);
    expect(slots[0]).toHaveAttribute('aria-pressed', 'true');
    expect(next).toBeEnabled();

    await userEvent.click(next);
    expect(screen.getByRole('heading', { name: 'Всё верно?' })).toBeInTheDocument();
  });

  it('on a full day offers the next day and the waitlist', async () => {
    mockApi({ ...baseRoutes, 'GET /availability': { body: { slots: [] } } });
    const tomorrow = addDays(todayIn(config.timezone), 1);
    renderBook(`/book?service=s1&master=m1&date=${tomorrow}&step=3`);

    expect(await screen.findByText('На эту дату свободного времени нет')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Следующий день/ })).toBeEnabled();
    expect(screen.getByRole('heading', { name: 'Хотите именно этот день?' })).toBeInTheDocument();
  });

  it('does not offer days beyond the 60-day booking window', async () => {
    mockApi({ ...baseRoutes, 'GET /availability': { body: { slots: [] } } });
    const lastDay = addDays(todayIn(config.timezone), 59);
    renderBook(`/book?service=s1&master=m1&date=${lastDay}&step=3`);

    await screen.findByText('На эту дату свободного времени нет');
    expect(screen.getByRole('button', { name: /Следующий день/ })).toBeDisabled();
  });
});

describe('Book page: guest booking through WhatsApp', () => {
  it('holds the slot with name and phone, then asks to confirm in WhatsApp', async () => {
    const fetchMock = mockApi({
      ...baseRoutes,
      'POST /booking-requests': { status: 201, body: { manageUrl: '/visit/abc' } },
    });
    renderBook(reviewStep);

    await userEvent.type(await screen.findByLabelText('Ваше имя'), '  Асель ');
    await userEvent.type(screen.getByLabelText('Телефон (WhatsApp)'), '+7 701 111 22 33');
    await userEvent.selectOptions(screen.getByLabelText('Откуда вы о нас узнали?'), 'instagram');
    await userEvent.click(screen.getByRole('button', { name: /Записаться/ }));

    expect(await screen.findByRole('heading', { name: 'Остался один шаг.' })).toBeInTheDocument();
    expect(posted(fetchMock, '/booking-requests')).toEqual({
      serviceId: 's1',
      masterId: 'm1',
      startsAt: SLOT_10,
      name: 'Асель',
      phone: '+7 701 111 22 33',
      source: 'instagram',
    });

    const whatsapp = screen.getByRole('link', { name: /Отправить в WhatsApp/ });
    const text = new URL(whatsapp.getAttribute('href')!).searchParams.get('text')!;
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/77001234567\?/);
    expect(text).toContain('Услуга: Стрижка');
    expect(text).toContain('Мастер: Айгерим');
    expect(text).toContain('Меня зовут Асель.');
    expect(screen.getByRole('link', { name: 'Моя запись' })).toHaveAttribute('href', '/visit/abc');
  });

  it('books family members together and limits them to three', async () => {
    const fetchMock = mockApi({
      ...baseRoutes,
      'POST /booking-requests': { status: 201, body: {} },
    });
    renderBook(reviewStep);

    const add = await screen.findByRole('button', { name: /Добавить человека/ });
    await userEvent.click(add);

    const family = screen.getByRole('group', { name: 'Записать вместе со мной' });
    const serviceSelect = within(family).getByLabelText('Услуга');
    // Only services of the chosen master (Айгерим) are offered.
    expect(within(serviceSelect).getByRole('option', { name: /Укладка/ })).toBeInTheDocument();
    expect(within(serviceSelect).queryByRole('option', { name: /Окрашивание/ })).toBeNull();

    await userEvent.type(within(family).getByLabelText('Имя'), 'Мама');
    await userEvent.selectOptions(serviceSelect, 's3');
    await userEvent.click(add);
    await userEvent.click(add);
    expect(screen.queryByRole('button', { name: /Добавить человека/ })).not.toBeInTheDocument();
    const remove = within(family).getAllByRole('button', { name: 'Убрать' });
    await userEvent.click(remove[2]);
    await userEvent.click(remove[1]);

    await userEvent.type(screen.getByLabelText('Ваше имя'), 'Асель');
    await userEvent.type(screen.getByLabelText('Телефон (WhatsApp)'), '+77011112233');
    await userEvent.click(screen.getByRole('button', { name: /Записаться/ }));

    await screen.findByRole('heading', { name: 'Остался один шаг.' });
    expect(posted(fetchMock, '/booking-requests').family).toEqual([
      { name: 'Мама', serviceId: 's3' },
    ]);
  });

  it('when the slot is taken, shows the error and returns to time selection', async () => {
    mockApi({
      ...baseRoutes,
      'POST /booking-requests': {
        status: 409,
        body: { code: 'SLOT_UNAVAILABLE', message: 'Это время уже заняли' },
      },
    });
    renderBook(reviewStep);

    await userEvent.type(await screen.findByLabelText('Ваше имя'), 'Асель');
    await userEvent.type(screen.getByLabelText('Телефон (WhatsApp)'), '+77011112233');
    await userEvent.click(screen.getByRole('button', { name: /Записаться/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это время уже заняли');
    // react-router applies the step change a moment after the error is shown.
    expect(await screen.findByRole('heading', { name: 'Когда вам удобно?' })).toBeInTheDocument();
  });

  it('after coming back from WhatsApp shows the confirmation, not the form again', async () => {
    mockApi(baseRoutes);
    sessionStorage.setItem('booking-sent', JSON.stringify({ name: 'Асель' }));
    window.history.replaceState(null, '', '/book?sent=1');
    renderBook(`${reviewStep}&sent=1`);

    expect(screen.getByRole('heading', { name: 'Остался один шаг.' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Ваше имя')).not.toBeInTheDocument();
  });
});

describe('Book page: admin booking', () => {
  const customer: User = { id: 'u1', name: 'Асель', email: 'a@example.com', role: 'CUSTOMER' };
  const adminRoutes = {
    ...baseRoutes,
    'GET /admin/customers': { body: { items: [customer], total: 1, page: 1, pageSize: 100 } },
  };

  it('requires a client, then books and shows «Вы записаны.»', async () => {
    const fetchMock = mockApi({
      ...adminRoutes,
      'POST /admin/appointments': {
        status: 201,
        body: {
          id: 'a1',
          serviceName: 'Стрижка',
          priceMinor: 500000,
          startsAt: SLOT_10,
          master: { id: 'm1', name: 'Айгерим' },
        } as Appointment,
      },
    });
    renderBook(reviewStep, true);

    const confirm = await screen.findByRole('button', { name: /Подтвердить запись/ });
    expect(confirm).toBeDisabled();
    await screen.findByRole('option', { name: /Асель/ });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Клиент/ }), 'u1');
    await waitFor(() => expect(confirm).toBeEnabled());

    await userEvent.click(confirm);

    expect(await screen.findByRole('heading', { name: 'Вы записаны.' })).toBeInTheDocument();
    expect(posted(fetchMock, '/admin/appointments')).toEqual({
      serviceId: 's1',
      masterId: 'm1',
      startsAt: SLOT_10,
      customerId: 'u1',
    });
  });

  it('re-checks the slot before booking and stops if it was taken meanwhile', async () => {
    const fetchMock = mockApi({
      ...adminRoutes,
      // Someone else booked 10:00 before the admin confirmed.
      'GET /availability': { body: { slots: [slot(SLOT_11)] } },
    });
    renderBook(reviewStep, true);

    await screen.findByRole('option', { name: /Асель/ });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Клиент/ }), 'u1');
    await userEvent.click(screen.getByRole('button', { name: /Подтвердить запись/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Это время уже занято');
    // react-router applies the step change a moment after the error is shown.
    expect(await screen.findByRole('heading', { name: 'Когда вам удобно?' })).toBeInTheDocument();
    expect(posted(fetchMock, '/admin/appointments')).toBeUndefined();
  });
});
