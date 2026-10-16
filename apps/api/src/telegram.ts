import { Injectable, Logger } from '@nestjs/common';

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sends salon notifications to a Telegram chat. Disabled until both variables are set. */
@Injectable()
export class Telegram {
  private log = new Logger('Telegram');
  // Read on each call so tests and serverless instances pick up current env values.
  private get token() {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  }
  private get chats() {
    // The owner's and master Nurgul's chats by default; TELEGRAM_CHAT_ID overrides them
    // (comma-separated list).
    return (process.env.TELEGRAM_CHAT_ID || '5980317055,6560514860')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  get enabled() {
    return !!this.token && this.chats.length > 0;
  }
  /** Lines are plain text; the first one is shown in bold, links go last. Never throws. */
  async notify(lines: string[], links: { text: string; url: string }[] = []): Promise<boolean> {
    if (!this.enabled) return false;
    const [title, ...rest] = lines.map(escape);
    const text = [
      `<b>${title}</b>`,
      ...rest,
      ...links.map(
        (l) => `<a href="${escape(l.url).replace(/"/g, '&quot;')}">${escape(l.text)}</a>`,
      ),
    ].join('\n');
    const results = await Promise.all(
      this.chats.map(async (chat) => {
        try {
          const api = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
          const response = await fetch(`${api}/bot${this.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chat,
              text,
              parse_mode: 'HTML',
              ...(links.length ? { link_preview_options: { is_disabled: true } } : {}),
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) this.log.warn(`sendMessage failed with HTTP ${response.status}`);
          return response.ok;
        } catch (error) {
          this.log.warn(`sendMessage failed: ${error instanceof Error ? error.message : error}`);
          return false;
        }
      }),
    );
    return results.some(Boolean);
  }
}
