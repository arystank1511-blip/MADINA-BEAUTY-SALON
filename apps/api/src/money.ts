import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Temporal } from '@js-temporal/polyfill';
import type { Response } from 'express';
import { Db } from './db';
import { config } from './config';
import { fail } from './errors';
import { Admin, SessionGuard } from './auth/auth';
import { ExpenseDto, MaterialDto, StockDto, StatsQuery } from './dto';
import { Telegram } from './telegram';
import { Push } from './push';
import { Clients } from './clients';
import { salonDate, startOfDay } from './availability/rules';

export const EXPENSE_CATEGORIES = [
  'Материалы',
  'Аренда',
  'Коммунальные',
  'Зарплата',
  'Реклама',
  'Другое',
] as const;

const STATUS: Record<string, string> = {
  PENDING: 'Ждёт подтверждения',
  CONFIRMED: 'Подтверждена',
  COMPLETED: 'Состоялась',
  NO_SHOW: 'Не пришёл',
  CANCELLED: 'Отменена',
};
/** A CSV that Excel opens correctly in Russian locale: BOM, «;» separators, quoted cells. */
export function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Leading =, +, -, @ would run as a formula in Excel (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v !== 'number' ? "'" + s : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
/** «+7 777…» would read as a formula in Excel; the local «8 777…» form is plain text. */
const phone = (p: string | null | undefined) => (p ?? '').trim().replace(/^\+7/, '8');
const amount = (minor: number | null) => (minor === null ? '' : (minor / 100).toFixed(0));

function range(from?: string, to?: string, now = new Date()) {
  const today = Temporal.PlainDate.from(salonDate(now, config.timezone));
  const f = from ? Temporal.PlainDate.from(from) : today.with({ day: 1 });
  const t = to ? Temporal.PlainDate.from(to) : today;
  if (Temporal.PlainDate.compare(t, f) < 0 || f.until(t).days > 366)
    fail(400, 'INVALID_RANGE', 'Период — от одного дня до года.');
  return { from: f.toString(), to: t.toString() };
}

/** Expenses and supplies: what the salon spends and what is running out. */
@Injectable()
export class Money {
  constructor(
    private db: Db,
    private telegram: Telegram,
    private push: Push,
  ) {}
  expenses(from: string, to: string) {
    return this.db.expense.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }
  async expenseTotals(from: string, to: string) {
    const rows = await this.db.expense.groupBy({
      by: ['category'],
      where: { date: { gte: from, lte: to } },
      _sum: { amountMinor: true },
    });
    const categories = rows
      .map((r) => ({ category: r.category, amountMinor: r._sum.amountMinor ?? 0 }))
      .sort((a, b) => b.amountMinor - a.amountMinor);
    return {
      expensesMinor: categories.reduce((s, c) => s + c.amountMinor, 0),
      expenseCategories: categories,
    };
  }
  materials() {
    return this.db.material.findMany({ orderBy: { name: 'asc' } });
  }
  low() {
    return this.db.$queryRaw<
      { name: string; quantity: number; unit: string }[]
    >`SELECT name, quantity, unit FROM "Material" WHERE quantity <= "minQuantity" ORDER BY name`;
  }
  /** Changes the stock by `delta`; the first drop to the minimum alerts the salon once. */
  async adjust(id: string, delta: number) {
    const m = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { quantity: number }[]
      >`SELECT quantity FROM "Material" WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows.length) fail(404, 'NOT_FOUND', 'Материал не найден.');
      const quantity = Math.max(0, rows[0].quantity + delta);
      return tx.material.update({ where: { id }, data: { quantity } });
    });
    return this.checkLow(m);
  }
  async save(id: string | null, b: MaterialDto) {
    try {
      const m = id
        ? await this.db.material.update({ where: { id }, data: b })
        : await this.db.material.create({ data: b });
      return this.checkLow(m);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        fail(409, 'DUPLICATE', 'Материал с таким названием уже есть.');
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')
        fail(404, 'NOT_FOUND', 'Материал не найден.');
      throw e;
    }
  }
  private async checkLow(m: Prisma.MaterialGetPayload<object>) {
    if (m.quantity > m.minQuantity) {
      if (m.lowAlertedAt)
        return this.db.material.update({ where: { id: m.id }, data: { lowAlertedAt: null } });
      return m;
    }
    // Claim the alert so two quick changes send it once.
    const { count } = await this.db.material.updateMany({
      where: { id: m.id, lowAlertedAt: null },
      data: { lowAlertedAt: new Date() },
    });
    if (count) {
      const left = `${m.name}: осталось ${m.quantity} ${m.unit}`;
      await Promise.all([
        this.telegram.notify([`Заканчивается материал · ${config.name}`, left, 'Пора докупить.']),
        this.push.notifyStaff({ title: 'Заканчивается материал', body: left, tag: `low-${m.id}` }),
      ]);
    }
    return this.db.material.findUniqueOrThrow({ where: { id: m.id } });
  }
}

@ApiTags('Администрирование')
@UseGuards(SessionGuard)
@Admin()
@Controller('admin')
export class MoneyController {
  constructor(
    private db: Db,
    private money: Money,
    private clients: Clients,
  ) {}
  @Get('expenses')
  @ApiOperation({ summary: 'Расходы за период' })
  async expenses(@Query() q: StatsQuery) {
    const { from, to } = range(q.from, q.to);
    return {
      items: await this.money.expenses(from, to),
      categories: EXPENSE_CATEGORIES,
      ...(await this.money.expenseTotals(from, to)),
    };
  }
  @Post('expenses')
  @ApiOperation({ summary: 'Добавить расход' })
  addExpense(@Body() b: ExpenseDto) {
    return this.db.expense.create({ data: { ...b, note: b.note ?? '' } });
  }
  @Delete('expenses/:id')
  @ApiOperation({ summary: 'Удалить расход' })
  async deleteExpense(@Param('id', ParseUUIDPipe) id: string) {
    await this.db.expense.deleteMany({ where: { id } });
    return { id };
  }
  @Get('materials')
  @ApiOperation({ summary: 'Материалы на складе' })
  materials() {
    return this.money.materials();
  }
  @Post('materials')
  @ApiOperation({ summary: 'Добавить материал' })
  addMaterial(@Body() b: MaterialDto) {
    return this.money.save(null, b);
  }
  @Patch('materials/:id')
  @ApiOperation({ summary: 'Изменить материал (название, единица, остаток, минимум)' })
  editMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() b: MaterialDto) {
    return this.money.save(id, b);
  }
  @Post('materials/:id/stock')
  @ApiOperation({ summary: 'Приход (+) или расход (−) материала' })
  stock(@Param('id', ParseUUIDPipe) id: string, @Body() b: StockDto) {
    return this.money.adjust(id, b.delta);
  }
  @Delete('materials/:id')
  @ApiOperation({ summary: 'Удалить материал' })
  async deleteMaterial(@Param('id', ParseUUIDPipe) id: string) {
    await this.db.material.deleteMany({ where: { id } });
    return { id };
  }
  @Get('export/:kind')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Выгрузка в Excel (CSV): visits, expenses или clients' })
  async export(@Param('kind') kind: string, @Query() q: StatsQuery, @Res() res: Response) {
    const { from, to } = range(q.from, q.to);
    const time = (d: Date) =>
      new Intl.DateTimeFormat('ru-RU', {
        timeZone: config.timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    let rows: (string | number | null)[][];
    if (kind === 'visits') {
      const visits = await this.db.appointment.findMany({
        where: {
          startsAt: {
            gte: startOfDay(from, config.timezone),
            lt: startOfDay(
              Temporal.PlainDate.from(to).add({ days: 1 }).toString(),
              config.timezone,
            ),
          },
        },
        include: { master: { select: { name: true } }, customer: { select: { name: true } } },
        orderBy: { startsAt: 'asc' },
      });
      rows = [
        [
          'Дата',
          'Время',
          'Клиент',
          'Телефон',
          'Услуга',
          'Мастер',
          'Статус',
          'Цена, ₸',
          'Оплачено, ₸',
          'Способ оплаты',
        ],
        ...visits.map((v) => [
          salonDate(v.startsAt, config.timezone),
          time(v.startsAt),
          v.guestName ?? v.customer?.name ?? '',
          phone(v.guestPhone),
          v.serviceName,
          v.master.name,
          STATUS[v.status] ?? v.status,
          amount(v.priceMinor),
          amount(v.paidMinor),
          v.paymentMethod === 'KASPI' ? 'Kaspi' : v.paymentMethod === 'CASH' ? 'Наличные' : '',
        ]),
      ];
    } else if (kind === 'expenses') {
      const items = await this.money.expenses(from, to);
      rows = [
        ['Дата', 'Категория', 'Сумма, ₸', 'Комментарий'],
        ...items.map((e) => [e.date, e.category, amount(e.amountMinor), e.note]),
      ];
    } else if (kind === 'clients') {
      const people = await this.clients.list('');
      const day = (d: Date | null) => (d ? salonDate(d, config.timezone) : '');
      rows = [
        [
          'Имя',
          'Телефон',
          'Визитов',
          'Не пришёл',
          'Потратил, ₸',
          'Последний визит',
          'Следующий визит',
          'День рождения',
          'Заметка',
        ],
        ...people.map((p) => [
          p.name,
          phone(p.displayPhone),
          p.visits,
          p.noShows,
          amount(p.spentMinor),
          day(p.lastVisit),
          day(p.nextVisit),
          p.birthday ?? '',
          p.note,
        ]),
      ];
    } else fail(404, 'NOT_FOUND', 'Неизвестная выгрузка.');
    const name = kind === 'clients' ? 'clients' : `${kind}_${from}_${to}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="madina_${name}.csv"`);
    res.send(csv(rows));
  }
}
