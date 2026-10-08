import {
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Role } from '@prisma/client';
import { Db } from '../db';
import { config } from '../config';
import { fail } from '../errors';
import { LoginDto, PasswordDto, RegisterDto } from '../dto';
const scrypt = promisify(derive);
// The master uses one phone; keep her signed in instead of asking for the password weekly.
const SESSION_DAYS = 180;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const safeUser = { id: true, name: true, email: true, role: true } as const;
export type Actor = { id: string; name: string; email: string; role: Role };
export type AuthRequest = Request & { actor: Actor };
export const Admin = () => SetMetadata('admin', true);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private db: Db,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.forma_session;
    if (!token) fail(401, 'UNAUTHENTICATED', 'Войдите в аккаунт.');
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: { select: safeUser } },
    });
    if (!session || session.expiresAt <= new Date())
      fail(401, 'UNAUTHENTICATED', 'Сессия завершена. Войдите снова.');
    if (
      this.reflector.getAllAndOverride<boolean>('admin', [ctx.getHandler(), ctx.getClass()]) &&
      session.user.role !== 'ADMIN'
    )
      fail(403, 'FORBIDDEN', 'Доступ только для администратора.');
    req.actor = session.user;
    return true;
  }
}
@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private db: Db) {}
  private limit(req: Request) {
    const now = Date.now();
    for (const [k, v] of this.attempts) if (v.until < now) this.attempts.delete(k);
    const key = req.ip || 'unknown';
    const value = this.attempts.get(key) || { count: 0, until: now + 60000 };
    value.count++;
    this.attempts.set(key, value);
    if (value.count > 20) fail(429, 'RATE_LIMIT', 'Слишком много попыток. Подождите одну минуту.');
  }
  private async session(user: Actor, res: Response, req: Request) {
    const old = (req.cookies as Record<string, string> | undefined)?.forma_session;
    if (old) await this.db.session.deleteMany({ where: { tokenHash: digest(old) } });
    const token = randomBytes(32).toString('base64url');
    await this.db.session.create({
      data: {
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
      },
    });
    res.cookie('forma_session', token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 86400000,
    });
    return user;
  }
  @Post('register')
  @ApiOperation({ summary: 'Регистрация CUSTOMER; email нормализуется' })
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limit(req);
    const user = await this.db.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: 'CUSTOMER',
      },
      select: safeUser,
    });
    return this.session(user, res, req);
  }
  @Post('login')
  @ApiOperation({ summary: 'Вход; устанавливает HttpOnly session cookie' })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limit(req);
    const user = await this.db.user.findUnique({ where: { email: body.email } });
    const valid = await verifyPassword(
      body.password,
      user?.passwordHash || '00000000000000000000000000000000:' + '0'.repeat(128),
    );
    if (!user || !valid) fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль.');
    return this.session(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      res,
      req,
    );
  }
  @Get('me')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Текущий пользователь' })
  me(@Req() req: AuthRequest) {
    return req.actor;
  }
  @Post('password')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Смена пароля; завершает все остальные сессии пользователя' })
  async password(@Body() body: PasswordDto, @Req() req: AuthRequest) {
    this.limit(req);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.actor.id } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash)))
      fail(400, 'INVALID_PASSWORD', 'Текущий пароль указан неверно.');
    if (body.currentPassword === body.newPassword)
      fail(400, 'SAME_PASSWORD', 'Новый пароль должен отличаться от текущего.');
    const token = (req.cookies as Record<string, string> | undefined)?.forma_session || '';
    await this.db.$transaction([
      this.db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(body.newPassword) },
      }),
      this.db.session.deleteMany({ where: { userId: user.id, NOT: { tokenHash: digest(token) } } }),
    ]);
    return { ok: true };
  }
  @Post('logout')
  @ApiOperation({ summary: 'Отзывает текущую сессию' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.forma_session;
    if (token) await this.db.session.deleteMany({ where: { tokenHash: digest(token) } });
    res.clearCookie('forma_session', {
      path: '/',
      httpOnly: true,
      secure: config.production,
      sameSite: 'lax',
    });
    return { ok: true };
  }
}
