import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { salonDate } from './availability/rules';

export interface Promo {
  enabled: boolean;
  text: string;
  /** Last day (salon date) the banner is shown; null means until switched off. */
  until: string | null;
}
const PROMO = 'promo';
/** File signatures, so only real images are stored whatever the declared type. */
const signatures: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

/** What the salon edits about the public site: the promo banner and the gallery. */
@Injectable()
export class Site {
  constructor(private db: Db) {}
  async promo(): Promise<Promo> {
    const row = await this.db.setting.findUnique({ where: { key: PROMO } });
    return { enabled: false, text: '', until: null, ...((row?.value as Partial<Promo>) ?? {}) };
  }
  /** The banner as the site shows it, or null when off, empty or past its date. */
  async activePromo(now = new Date()) {
    const p = await this.promo();
    if (!p.enabled || !p.text.trim()) return null;
    if (p.until && p.until < salonDate(now, config.timezone)) return null;
    return { text: p.text.trim(), until: p.until };
  }
  async savePromo(p: Promo) {
    const value = { enabled: p.enabled, text: p.text.trim(), until: p.until || null };
    await this.db.setting.upsert({
      where: { key: PROMO },
      create: { key: PROMO, value: value as Prisma.InputJsonObject },
      update: { value: value as Prisma.InputJsonObject },
    });
    return this.promo();
  }
  gallery() {
    return this.db.photo.findMany({
      select: { id: true, caption: true, width: true, height: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }
  photo(id: string) {
    return this.db.photo.findUnique({ where: { id }, select: { data: true, mime: true } });
  }
  async addPhoto(p: {
    data: string;
    mime: string;
    caption?: string;
    width: number;
    height: number;
  }) {
    const data = Buffer.from(p.data, 'base64');
    if (data.length > 3000000) fail(400, 'TOO_LARGE', 'Фото слишком большое. Попробуйте другое.');
    if (!signatures[p.mime]?.(data))
      fail(400, 'NOT_AN_IMAGE', 'Это не похоже на фото JPEG, PNG или WebP.');
    return this.db.photo.create({
      data: {
        data,
        mime: p.mime,
        caption: p.caption?.trim() ?? '',
        width: p.width,
        height: p.height,
      },
      select: { id: true, caption: true, width: true, height: true, createdAt: true },
    });
  }
  async caption(id: string, caption: string) {
    const { count } = await this.db.photo.updateMany({
      where: { id },
      data: { caption: caption.trim() },
    });
    if (!count) fail(404, 'NOT_FOUND', 'Фото не найдено.');
    return { id, caption: caption.trim() };
  }
  async remove(id: string) {
    await this.db.photo.deleteMany({ where: { id } });
    return { id };
  }
}
