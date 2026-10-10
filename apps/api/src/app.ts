import 'reflect-metadata';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import { Db } from './db';
import { AuthController, SessionGuard } from './auth/auth';
import { BookingService } from './booking/booking.service';
import { BookingController } from './booking/booking.controller';
import { AdminController } from './admin/admin.controller';
import { PublicController } from './public.controller';
import { Errors } from './errors';
import { Telegram } from './telegram';
import { Reminders, RemindersController } from './reminders';
import { WhatsApp } from './whatsapp';
import { config, isAllowedOrigin } from './config';
@Module({
  controllers: [
    AuthController,
    BookingController,
    AdminController,
    PublicController,
    RemindersController,
  ],
  providers: [Db, SessionGuard, BookingService, Telegram, Reminders, WhatsApp],
})
export class AppModule {}
export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  // Only enable one trusted hop when API is reachable exclusively through our proxy.
  if (process.env.TRUST_PROXY === '1') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!isAllowedOrigin(req.headers.origin) || req.headers['x-csrf-protection'] !== '1')
    ) {
      res.status(403).json({
        code: 'CSRF_REJECTED',
        message: 'Запрос не прошёл проверку безопасности. Обновите страницу.',
      });
      return;
    }
    next();
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new Errors());
  const builder = new DocumentBuilder()
    .setTitle(`${config.name} API`)
    .setVersion('1.0.0')
    .setDescription(
      'Серверные сессии в HttpOnly cookie forma_session. Все изменяющие запросы требуют Origin, совпадающий с APP_ORIGIN, и X-CSRF-Protection: 1. CORS отключён. Цена в минимальных единицах валюты. Время ISO-8601 с Z/offset. Конфликт: {"code":"SLOT_UNAVAILABLE","message":"Это время уже занято. Выберите другой слот."}. Полуоткрытые интервалы [start,end), включая буфер.',
    )
    .addCookieAuth('forma_session')
    .build();
  const doc = SwaggerModule.createDocument(app, builder);
  for (const path of Object.values(doc.paths))
    for (const operation of Object.values(path)) {
      if (operation && typeof operation === 'object' && 'responses' in operation) {
        Object.assign(operation.responses, {
          400: { description: 'Ошибка входных данных' },
          401: { description: 'Требуется сессия' },
          403: { description: 'Недостаточно прав или CSRF' },
          409: {
            description: 'Конфликт',
            content: {
              'application/json': {
                example: {
                  code: 'SLOT_UNAVAILABLE',
                  message: 'Это время уже занято. Выберите другой слот.',
                },
              },
            },
          },
        });
      }
    }
  SwaggerModule.setup('api/docs', app, doc, {
    jsonDocumentUrl: 'api/openapi.json',
    swaggerOptions: {
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-CSRF-Protection'] = '1';
        return request;
      },
    },
  });
  app.enableShutdownHooks();
  return app;
}
