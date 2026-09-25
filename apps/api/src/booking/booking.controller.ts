import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthRequest, SessionGuard } from '../auth/auth';
import { BookingDto, ListDto } from '../dto';
import { BookingService } from './booking.service';
@ApiTags('Записи')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('appointments')
export class BookingController {
  constructor(private booking: BookingService) {}
  @Post()
  @ApiOperation({ summary: 'Запись от имени текущего клиента; конфликт 409 SLOT_UNAVAILABLE' })
  create(@Body() body: BookingDto, @Req() req: AuthRequest) {
    return this.booking.create(body, req.actor.id);
  }
  @Get('my')
  @ApiOperation({ summary: 'Мои посещения с пагинацией и фильтрами' })
  mine(@Query() q: ListDto, @Req() req: AuthRequest) {
    return this.booking.list(q, req.actor.id);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Детали собственной записи' })
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.get(id, req.actor);
  }
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Отмена будущей записи; повторная отмена идемпотентна' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.booking.change(id, req.actor);
  }
}
