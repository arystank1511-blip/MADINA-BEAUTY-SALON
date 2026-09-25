import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
export function fail(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): never {
  throw new HttpException({ code, message, ...extra }, status);
}
export function unavailable(): never {
  return fail(409, 'SLOT_UNAVAILABLE', 'Это время уже занято. Выберите другой слот.');
}
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const b = typeof body === 'object' ? (body as Record<string, unknown>) : { message: body };
      res.status(error.getStatus()).json({
        code: b.code || `HTTP_${error.getStatus()}`,
        message: Array.isArray(b.message) ? 'Проверьте заполнение полей.' : b.message,
        ...b,
      });
      return;
    }
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    // Only the named exclusion constraint is a booking collision, never arbitrary DB errors.
    if (
      (e.code === 'P2004' ||
        e.code === 'P2010' ||
        e.code === '23P01' ||
        e.meta?.code === '23P01') &&
      e.message?.includes('Appointment_no_overlap')
    ) {
      res
        .status(409)
        .json({ code: 'SLOT_UNAVAILABLE', message: 'Это время уже занято. Выберите другой слот.' });
      return;
    }
    if (e.code === 'P2025') {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Объект не найден.' });
      return;
    }
    if (e.code === 'P2002') {
      res.status(409).json({ code: 'ALREADY_EXISTS', message: 'Такие данные уже существуют.' });
      return;
    }
    if (e.code === 'P2003') {
      res.status(400).json({ code: 'INVALID_REFERENCE', message: 'Связанный объект не найден.' });
      return;
    }
    console.error('Unexpected request error', e.code || 'unknown');
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Не удалось выполнить действие. Попробуйте позже.',
    });
  }
}
