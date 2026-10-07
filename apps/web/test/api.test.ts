import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, send } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

function reply(body: BodyInit | null, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('API transport', () => {
  it('returns JSON and keeps headers supplied as a Headers instance', async () => {
    const fetcher = reply('{"ok":true}');
    expect(await api('/health', { headers: new Headers({ 'X-Request-ID': 'test' }) })).toEqual({
      ok: true,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/health');
    expect(options.credentials).toBe('same-origin');
    const headers = new Headers(options.headers);
    expect(headers.get('X-Request-ID')).toBe('test');
    expect(headers.get('X-CSRF-Protection')).toBe('1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('serializes mutation bodies', async () => {
    const fetcher = reply('{"ok":true}');
    await send('/appointments', 'POST', { serviceId: 'test' });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{"serviceId":"test"}',
    });
  });

  it.each(['<html>Bad Gateway</html>', '', 'null', '"upstream error"'])(
    'preserves the HTTP status for an unexpected error body: %s',
    async (body) => {
      reply(body, 502);
      await expect(api('/config')).rejects.toMatchObject({
        status: 502,
        code: 'HTTP_ERROR',
        message: 'Не удалось выполнить действие. Попробуйте ещё раз.',
        conflicts: [],
      });
    },
  );

  it('preserves an empty unauthorized response for session handling', async () => {
    reply('', 401);
    await expect(api('/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('preserves application errors and validated schedule conflicts', async () => {
    const conflict = {
      id: 'appointment',
      startsAt: '2030-01-01T10:00:00Z',
      serviceName: 'Стрижка',
      customer: { name: 'Тестовый клиент' },
    };
    reply(
      JSON.stringify({ code: 'SCHEDULE_CONFLICT', message: 'Конфликт', conflicts: [conflict] }),
      409,
    );
    await expect(api('/admin/schedule')).rejects.toMatchObject({
      status: 409,
      code: 'SCHEDULE_CONFLICT',
      message: 'Конфликт',
      conflicts: [conflict],
    });
  });

  it.each([{ conflicts: null }, { conflicts: {} }, { conflicts: [null, { id: 'invalid' }] }])(
    'ignores malformed conflict details: $conflicts',
    async ({ conflicts }) => {
      reply(JSON.stringify({ message: ['email must be valid'], conflicts }), 400);
      await expect(api('/auth/login')).rejects.toMatchObject({
        status: 400,
        message: 'Проверьте заполнение полей.',
        conflicts: [],
      });
    },
  );

  it('handles successful no-content responses', async () => {
    reply(null, 204);
    expect(await api('/resource')).toBeUndefined();
  });

  it('reports malformed successful JSON without leaking a parser error', async () => {
    reply('<html>Not the API</html>');
    await expect(api('/config')).rejects.toMatchObject({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'Сервер вернул некорректный ответ. Попробуйте ещё раз.',
    });
  });

  it('converts connection failures into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/config')).rejects.toBeInstanceOf(ApiError);
    await expect(api('/config')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('preserves cancellation instead of reporting a connectivity failure', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(controller.signal.reason));
    await expect(api('/availability', { signal: controller.signal })).rejects.toBe(
      controller.signal.reason,
    );
  });

  it('preserves cancellation while reading the response body', async () => {
    const error = new DOMException('The operation was aborted.', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: vi.fn().mockRejectedValue(error),
      }),
    );
    await expect(api('/availability')).rejects.toBe(error);
  });
});
