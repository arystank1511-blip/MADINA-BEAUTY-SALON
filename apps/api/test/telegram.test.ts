import { afterEach, describe, expect, it, vi } from 'vitest';
import { Telegram } from '../src/telegram';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Telegram notifications', () => {
  it('stays silent without a token and chat id', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('TELEGRAM_CHAT_ID', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await new Telegram().notify(['Заявка'])).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('escapes HTML and sends to every configured chat', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '1, 2');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await new Telegram().notify(['Новая <заявка>', 'Имя: A&B'])).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bottoken/sendMessage');
    expect(JSON.parse(options.body)).toEqual({
      chat_id: '1',
      text: '<b>Новая &lt;заявка&gt;</b>\nИмя: A&amp;B',
      parse_mode: 'HTML',
    });
  });

  it('appends links as anchors without previews, escaping the URL', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '1');
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await new Telegram().notify(
      ['Через 40 мин'],
      [{ text: 'Напомнить', url: 'https://wa.me/7?a=1&b="2"' }],
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      chat_id: '1',
      text: '<b>Через 40 мин</b>\n<a href="https://wa.me/7?a=1&amp;b=&quot;2&quot;">Напомнить</a>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  });

  it('never throws when Telegram is unreachable', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await new Telegram().notify(['Заявка'])).toBe(false);
  });
});
