import { Body, Controller, Get, Injectable, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import webpush from 'web-push';
import { Db } from './db';
import { config } from './config';
import { AuthRequest, SessionGuard, Staff } from './auth/auth';
import { PushSubscriptionDto, PushEndpointDto, PushTestDto } from './dto';

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open on tap, «/master» by default. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}
const KEYS = 'vapid';

/**
 * Web Push to the salon's own devices. The VAPID key pair is created on first use and kept
 * in the database, so nothing has to be configured in Vercel.
 */
@Injectable()
export class Push {
  private log = new Logger('Push');
  /** PUSH_DRY_RUN=1 (tests): record messages instead of sending them. */
  readonly sent: { endpoint: string; message: PushMessage }[] = [];
  constructor(private db: Db) {}
  async keys(): Promise<{ publicKey: string; privateKey: string }> {
    const row = await this.db.setting.findUnique({ where: { key: KEYS } });
    if (row) return row.value as { publicKey: string; privateKey: string };
    const keys = webpush.generateVAPIDKeys();
    // Concurrent first calls: only one pair wins; everyone then reads the stored one.
    await this.db.setting
      .create({ data: { key: KEYS, value: keys as unknown as Prisma.InputJsonObject } })
      .catch(() => undefined);
    const stored = await this.db.setting.findUniqueOrThrow({ where: { key: KEYS } });
    return stored.value as { publicKey: string; privateKey: string };
  }
  async subscribers() {
    return this.db.pushSubscription.count({
      where: { user: { role: { in: ['ADMIN', 'MASTER'] } } },
    });
  }
  /** Sends to every staff device; forgets devices the browser has unsubscribed. Never throws. */
  async notifyStaff(message: PushMessage) {
    return (await this.deliver(message)).filter((r) => r.ok).length;
  }
  /** Per-device outcome; status is the push service's HTTP code when it refused. */
  async deliver(
    message: PushMessage,
  ): Promise<{ endpoint: string; ok: boolean; status?: number }[]> {
    const subscriptions = await this.db.pushSubscription.findMany({
      where: { user: { role: { in: ['ADMIN', 'MASTER'] } } },
    });
    if (!subscriptions.length) return [];
    const payload = JSON.stringify({ url: '/master', ...message });
    if (process.env.PUSH_DRY_RUN === '1') {
      for (const s of subscriptions) this.sent.push({ endpoint: s.endpoint, message });
      return subscriptions.map((s) => ({ endpoint: s.endpoint, ok: true }));
    }
    const { publicKey, privateKey } = await this.keys();
    return Promise.all(
      subscriptions.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            {
              vapidDetails: { subject: config.siteUrl, publicKey, privateKey },
              TTL: 6 * 3600,
              urgency: 'high',
              timeout: 8000,
            },
          );
          return { endpoint: s.endpoint, ok: true };
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            await this.db.pushSubscription.deleteMany({ where: { id: s.id } });
          else this.log.warn(`push failed: ${status ?? (e as Error).message}`);
          return { endpoint: s.endpoint, ok: false, status };
        }
      }),
    );
  }
}

@ApiTags('Уведомления')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('push')
export class PushController {
  constructor(
    private push: Push,
    private db: Db,
  ) {}
  @Get('key')
  @Staff()
  @ApiOperation({ summary: 'Публичный VAPID-ключ для подписки браузера' })
  async key() {
    return { publicKey: (await this.push.keys()).publicKey };
  }
  @Post('subscribe')
  @Staff()
  @ApiOperation({ summary: 'Включить уведомления на этом устройстве' })
  async subscribe(@Body() b: PushSubscriptionDto, @Req() req: AuthRequest) {
    const data = { userId: req.actor.id, p256dh: b.keys.p256dh, auth: b.keys.auth };
    await this.db.pushSubscription.upsert({
      where: { endpoint: b.endpoint },
      create: { endpoint: b.endpoint, ...data },
      update: data,
    });
    return { subscribed: true };
  }
  @Post('unsubscribe')
  @Staff()
  @ApiOperation({ summary: 'Выключить уведомления на этом устройстве' })
  async unsubscribe(@Body() b: PushEndpointDto, @Req() req: AuthRequest) {
    await this.db.pushSubscription.deleteMany({
      where: { endpoint: b.endpoint, userId: req.actor.id },
    });
    return { subscribed: false };
  }
  @Post('test')
  @Staff()
  @ApiOperation({ summary: 'Пробное уведомление на все устройства салона' })
  async test(@Body() b: PushTestDto) {
    const results = await this.push.deliver({
      title: `${config.name}: уведомления работают`,
      body: 'Так будут приходить новые заявки с сайта и напоминания за час.',
      tag: 'test',
    });
    const mine = b.endpoint ? results.find((r) => r.endpoint === b.endpoint) : undefined;
    return {
      sent: results.filter((r) => r.ok).length,
      devices: results.length,
      // What happened on the device that pressed «Проверить»: missing means the server
      // does not know this subscription (it was removed), failed means the push service refused it.
      here: !b.endpoint ? undefined : !mine ? 'missing' : mine.ok ? 'sent' : 'failed',
      status: mine?.status,
    };
  }
}
