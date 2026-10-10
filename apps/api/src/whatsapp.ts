import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';

export interface WhatsAppSettings {
  enabled: boolean;
  /** «Phone number ID» from Meta: WhatsApp → API Setup. */
  phoneNumberId: string;
  /** Permanent access token of a system user with whatsapp_business_messaging. */
  accessToken: string;
  /** Approved Utility template with three body variables: name, when, service. */
  templateName: string;
  language: string;
}
const KEY = 'whatsapp';
const empty: WhatsAppSettings = {
  enabled: false,
  phoneNumberId: '',
  accessToken: '',
  templateName: '',
  language: 'ru',
};

/** Sends template messages to clients through the WhatsApp Business (Cloud) API. */
@Injectable()
export class WhatsApp {
  private log = new Logger('WhatsApp');
  constructor(private db: Db) {}
  async settings(): Promise<WhatsAppSettings> {
    const row = await this.db.setting.findUnique({ where: { key: KEY } });
    return { ...empty, ...((row?.value as Partial<WhatsAppSettings> | null) ?? {}) };
  }
  /** Settings safe to show in the admin: the token is never sent back, only its last characters. */
  async publicSettings() {
    const { accessToken, ...rest } = await this.settings();
    return { ...rest, tokenHint: accessToken ? '…' + accessToken.slice(-4) : '' };
  }
  async save(patch: Partial<WhatsAppSettings>) {
    const next = { ...(await this.settings()), ...patch };
    const value = next as unknown as Prisma.InputJsonObject;
    await this.db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    return this.publicSettings();
  }
  /** Settings when automatic sending is switched on and complete, otherwise null. */
  async active() {
    const s = await this.settings();
    return s.enabled && s.phoneNumberId && s.accessToken && s.templateName ? s : null;
  }
  /** Sends the reminder template; never throws, returns Meta's error text on failure. */
  async send(
    s: WhatsAppSettings,
    to: string,
    params: string[],
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const api = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
    try {
      const response = await fetch(`${api}/${encodeURIComponent(s.phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.accessToken}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: s.templateName,
            language: { code: s.language || 'ru' },
            components: [
              {
                type: 'body',
                parameters: params.map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) return { ok: true };
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; error_data?: { details?: string } };
      } | null;
      const error =
        [body?.error?.message, body?.error?.error_data?.details].filter(Boolean).join(' — ') ||
        `HTTP ${response.status}`;
      this.log.warn(`send failed: ${error}`);
      return { ok: false, error: error.slice(0, 500) };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.log.warn(`send failed: ${error}`);
      return { ok: false, error: `Нет связи с WhatsApp API: ${error}`.slice(0, 500) };
    }
  }
}
