import { useQuery } from '@tanstack/react-query';
export interface Config {
  name: string;
  currency: string;
  timezone: string;
  address: string;
  contact: string;
  hours: string;
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
  name: string;
  description: string;
  priceMinor: number;
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
  customerId: string;
  serviceName: string;
  priceMinor: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  occupiedUntil: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  master: { id: string; name: string };
  customer: User;
}
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
