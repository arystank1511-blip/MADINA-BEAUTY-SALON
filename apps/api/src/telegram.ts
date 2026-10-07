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
    // Salon owner's chat by default; TELEGRAM_CHAT_ID overrides it (comma-separated list).
    return (process.env.TELEGRAM_CHAT_ID || '5980317055')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  get enabled() {
    return !!this.token && this.chats.length > 0;
  }
  /** Lines are plain text; the first one is shown in bold. Never throws. */
  async notify(lines: string[]): Promise<boolean> {
    if (!this.enabled) return false;
    const [title, ...rest] = lines.map(escape);
    const text = [`<b>${title}</b>`, ...rest].join('\n');
    const results = await Promise.all(
      this.chats.map(async (chat) => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' }),
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
