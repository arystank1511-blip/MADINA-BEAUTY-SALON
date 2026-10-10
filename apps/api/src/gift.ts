import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { Db } from './db';
import { fail } from './errors';
import { Admin, SessionGuard, Staff } from './auth/auth';
import { GiftCardDto, RedeemDto, ReviewDto } from './dto';
import { Growth } from './growth';

/** No 0/O, 1/I/L: the code is read aloud and typed from paper. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () =>
  Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const status = (g: { redeemedAt: Date | null; expiresAt: Date }, now = new Date()) =>
  g.redeemedAt ? 'USED' : g.expiresAt <= now ? 'EXPIRED' : 'ACTIVE';

/** Gift certificates (sold in the salon, printed from /gift/<code>) and reviews on the site. */
@Injectable()
export class Gifts {
  constructor(private db: Db) {}
  async create(b: GiftCardDto, now = new Date()) {
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + b.months);
    for (let attempt = 0; ; attempt++)
      try {
        return await this.db.giftCard.create({
          data: {
            code: newCode(),
            amountMinor: b.amountMinor,
            recipient: b.recipient,
            sender: b.sender ?? '',
            phone: b.phone || null,
            expiresAt,
          },
        });
      } catch (e) {
        // A code collision is astronomically rare; try another code.
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
          continue;
        throw e;
      }
  }
  async list() {
    const cards = await this.db.giftCard.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return cards.map((g) => ({ ...g, status: status(g) }));
  }
  async byCode(code: string) {
    const g = await this.db.giftCard.findUnique({ where: { code: code.toUpperCase() } });
    if (!g) fail(404, 'NOT_FOUND', 'Сертификат не найден. Проверьте код.');
    return g;
  }
  async redeem(id: string, redeemed: boolean) {
    const g = await this.db.giftCard.findUnique({ where: { id } });
    if (!g) fail(404, 'NOT_FOUND', 'Сертификат не найден.');
    if (redeemed && status(g) === 'EXPIRED')
      fail(409, 'EXPIRED', 'Срок действия сертификата истёк.');
    const updated = await this.db.giftCard.update({
      where: { id },
      data: { redeemedAt: redeemed ? (g.redeemedAt ?? new Date()) : null },
    });
    return { ...updated, status: status(updated) };
  }
}

@ApiTags('Публичные')
@Controller()
export class GiftController {
  constructor(
    private db: Db,
    private gifts: Gifts,
    private growth: Growth,
  ) {}
  @Get('gift/:code')
  @ApiOperation({ summary: 'Подарочный сертификат по коду (страница для печати)' })
  async show(@Param('code') code: string) {
    if (!/^[A-Za-z0-9]{8}$/.test(code))
      fail(404, 'NOT_FOUND', 'Сертификат не найден. Проверьте код.');
    const g = await this.gifts.byCode(code);
    return {
      code: g.code,
      amountMinor: g.amountMinor,
      recipient: g.recipient,
      sender: g.sender,
      expiresAt: g.expiresAt,
      status: status(g),
    };
  }
  @Get('reviews')
  @ApiOperation({ summary: 'Отзывы на сайте и ссылка на все отзывы (2GIS)' })
  async reviews() {
    const [reviews, settings] = await Promise.all([
      this.db.review.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
      this.growth.settings(),
    ]);
    return {
      reviews: reviews.map(({ id, name, text, rating }) => ({ id, name, text, rating })),
      url: settings.reviewUrl,
    };
  }
}

@ApiTags('Администрирование')
@UseGuards(SessionGuard)
@Admin()
@Controller('admin')
export class GiftAdminController {
  constructor(
    private db: Db,
    private gifts: Gifts,
  ) {}
  @Get('gift-cards')
  @ApiOperation({ summary: 'Проданные сертификаты' })
  list() {
    return this.gifts.list();
  }
  @Post('gift-cards')
  @ApiOperation({ summary: 'Оформить сертификат после оплаты' })
  create(@Body() b: GiftCardDto) {
    return this.gifts.create(b);
  }
  @Staff()
  @Get('gift-cards/:code')
  @ApiOperation({ summary: 'Проверить сертификат по коду' })
  async check(@Param('code') code: string) {
    const g = await this.gifts.byCode(code);
    return { ...g, status: status(g) };
  }
  @Staff()
  @Patch('gift-cards/:id/redeem')
  @ApiOperation({ summary: 'Отметить сертификат использованным (или вернуть)' })
  redeem(@Param('id', ParseUUIDPipe) id: string, @Body() b: RedeemDto) {
    return this.gifts.redeem(id, b.redeemed);
  }
  @Get('reviews')
  @ApiOperation({ summary: 'Отзывы, показанные на сайте' })
  reviews() {
    return this.db.review.findMany({ orderBy: { createdAt: 'desc' } });
  }
  @Post('reviews')
  @ApiOperation({ summary: 'Добавить отзыв на сайт' })
  addReview(@Body() b: ReviewDto) {
    return this.db.review.create({ data: b });
  }
  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Убрать отзыв с сайта' })
  async deleteReview(@Param('id', ParseUUIDPipe) id: string) {
    await this.db.review.deleteMany({ where: { id } });
    return { id };
  }
}
