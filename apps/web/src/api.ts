import { useQuery } from '@tanstack/react-query';
export interface Config {
  name: string;
  currency: string;
  timezone: string;
  address: string;
  contact: string;
  hours: string;
  payment: string;
  map: string;
  whatsapp: string;
  demo: boolean;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
}
export interface Service {
  id: string;
  category: string;
  name: string;
  description: string;
  priceMinor: number;
  priceFrom: boolean;
  durationMinutes: number;
  bufferAfterMinutes: number;
  isActive: boolean;
}
export interface Master {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  isActive: boolean;
  services: { serviceId: string; service: Service }[];
}
export interface Appointment {
  id: string;
  masterId: string;
  customerId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  holdUntil: string | null;
  alertedAt: string | null;
  remindedAt: string | null;
  serviceName: string;
  priceMinor: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  master: { id: string; name: string };
  customer: User | null;
}
/** Display name of whoever the visit is for: account holder or a guest named by the master. */
export const clientName = (a: Pick<Appointment, 'customer' | 'guestName'>) =>
  a.customer?.name || a.guestName || 'Клиент';
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Slot {
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
}
export interface Window {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
}
export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public conflicts: {
      id: string;
      startsAt: string;
      serviceName: string;
      customer: { name: string };
    }[] = [],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-CSRF-Protection': '1',
  });
  new Headers(options.headers).forEach((value, name) => headers.set(name, value));
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      ...options,
      credentials: 'same-origin',
      headers,
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
      throw error;
    throw new ApiError(0, 'NETWORK', 'Не удалось подключиться. Проверьте соединение и повторите.');
  }
  if (response.status === 204) return undefined as T;
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
      throw error;
    if (response.ok)
      throw new ApiError(
        response.status,
        'INVALID_RESPONSE',
        'Сервер вернул некорректный ответ. Попробуйте ещё раз.',
      );
    // Proxies can return HTML or an empty body. Preserve their HTTP status (especially 401).
  }
  if (!response.ok) {
    const data = isRecord(body) ? body : {};
    throw new ApiError(
      response.status,
      typeof data.code === 'string' ? data.code : 'HTTP_ERROR',
      Array.isArray(data.message)
        ? 'Проверьте заполнение полей.'
        : typeof data.message === 'string' && data.message
          ? data.message
          : 'Не удалось выполнить действие. Попробуйте ещё раз.',
      Array.isArray(data.conflicts) ? data.conflicts.filter(isConflict) : [],
    );
  }
  return body as T;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isConflict(value: unknown): value is ApiError['conflicts'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.startsAt === 'string' &&
    typeof value.serviceName === 'string' &&
    isRecord(value.customer) &&
    typeof value.customer.name === 'string'
  );
}
export const send = <T>(path: string, method: string, body: unknown = {}) =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () =>
      api<User>('/auth/me').catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }),
    retry: false,
  });
}
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api<Config>('/config'),
    staleTime: Infinity,
  });
}
export function useServices(admin = false) {
  return useQuery({
    queryKey: ['services', admin],
    queryFn: () => api<Service[]>(admin ? '/admin/services' : '/services'),
  });
}
export function useMasters(admin = false) {
  return useQuery({
    queryKey: ['masters', admin],
    queryFn: () => api<Master[]>(admin ? '/admin/masters' : '/masters'),
  });
}
/** Service price as shown to clients: most prices are a minimum, «от 2 500 ₸». */
export const price = (service: Pick<Service, 'priceMinor' | 'priceFrom'>, currency: string) =>
  `${service.priceFrom ? 'от ' : ''}${money(service.priceMinor, currency)}`;
/** Splits services into consecutive groups by hall, keeping their order. */
export function byCategory<T extends Pick<Service, 'category'>>(services: T[]) {
  const groups: { category: string; items: T[] }[] = [];
  for (const s of services) {
    const last = groups[groups.length - 1];
    if (last && last.category === s.category) last.items.push(s);
    else groups.push({ category: s.category, items: [s] });
  }
  return groups;
}
export const money = (value: number, currency: string) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
export const dateLabel = (value: string, zone: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
export const timeLabel = (value: string, zone: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
export const todayIn = (zone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const addDays = (value: string, n: number) => {
  const d = new Date(value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const whatsappLink = (config: Config, text?: string) =>
  `https://wa.me/${config.whatsapp}` + (text ? `?text=${encodeURIComponent(text)}` : '');
export const phoneLabel = (digits: string) =>
  digits.length === 11
    ? `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`
    : `+${digits}`;
