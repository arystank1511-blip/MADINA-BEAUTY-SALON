import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
const offset = /(?:Z|[+-]\d{2}:\d{2})$/;
export class LoginDto {
  @ApiProperty({ example: 'client@forma.example' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @ApiProperty({ minLength: 10 }) @IsString() @Length(10, 128) password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty() @IsString() @Length(2, 80) name!: string;
}
export class PasswordDto {
  @ApiProperty() @IsString() @Length(1, 128) currentPassword!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @Length(12, 128) newPassword!: string;
}
export class BookingDto {
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() masterId!: string;
  @ApiProperty({ example: '2030-01-07T10:00:00+05:00' })
  @IsDateString({ strict: true })
  @Matches(offset)
  startsAt!: string;
}
export class BookingRequestDto {
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() masterId!: string;
  @ApiProperty({ example: '2030-01-07T10:00:00+05:00' })
  @IsDateString({ strict: true })
  @Matches(offset)
  startsAt!: string;
  @ApiProperty({ example: 'Айгерим' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name!: string;
  @ApiProperty({ required: false, example: '+7 700 000 00 00' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[+\d\s()-]{0,30}$/)
  phone?: string;
}
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class QuickBookingDto extends BookingDto {
  @ApiProperty({ example: 'Айгерим' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  guestName!: string;
  @ApiProperty({ required: false, example: '+7 700 000 00 00' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(/^[+\d\s()-]{0,30}$/)
  guestPhone?: string;
}
export class DayQuery {
  @ApiProperty({ required: false, example: '2030-01-07' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() masterId?: string;
}
export class AdminBookingDto extends BookingDto {
  @ApiProperty() @IsUUID() customerId!: string;
}
export class AvailabilityDto {
  @ApiProperty() @IsUUID() serviceId!: string;
  @ApiProperty() @IsUUID() masterId!: string;
  @ApiProperty({ example: '2030-01-07' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}
export class ServiceDto {
  @ApiProperty({ required: false, description: 'Зал, например «Женский зал»' })
  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;
  @ApiProperty() @IsString() @Length(2, 150) name!: string;
  @ApiProperty() @IsString() @Length(0, 2000) description!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(100000000) priceMinor!: number;
  @ApiProperty({ required: false, description: 'Показывать цену как «от …»' })
  @IsOptional()
  @IsBoolean()
  priceFrom?: boolean;
  @ApiProperty() @IsInt() @Min(5) @Max(600) durationMinutes!: number;
  @ApiProperty() @IsInt() @Min(0) @Max(120) bufferAfterMinutes!: number;
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
export class ServicePatch extends PartialType(ServiceDto) {}
export class MasterDto {
  @ApiProperty() @IsString() @Length(2, 100) name!: string;
  @ApiProperty() @IsString() @Length(0, 2000) description!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Matches(/^(\/images\/[a-zA-Z0-9_.-]+|https:\/\/[^\s]+)$/)
  avatarUrl?: string;
  @ApiProperty() @IsBoolean() isActive!: boolean;
}
export class MasterPatch extends PartialType(MasterDto) {}
export class ServicesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  serviceIds!: string[];
}
export class WindowDto {
  @ApiProperty() @IsInt() @Min(1) @Max(7) weekday!: number;
  @ApiProperty({ example: '10:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @ApiProperty({ example: '19:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
}
export class HoursDto {
  @ApiProperty({ type: [WindowDto] })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WindowDto)
  hours!: WindowDto[];
}
export class TimeOffDto {
  @ApiProperty() @IsDateString({ strict: true }) @Matches(offset) startsAt!: string;
  @ApiProperty() @IsDateString({ strict: true }) @Matches(offset) endsAt!: string;
  @ApiProperty() @IsString() @Length(0, 300) reason!: string;
}
export class ListDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() masterId?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
export class MasterQuery {
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() serviceId?: string;
}
export class WhatsAppSettingsDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ description: 'Phone number ID из Meta (WhatsApp → API Setup)' })
  @IsString()
  @Matches(/^\d{0,30}$/, { message: 'Phone number ID — только цифры.' })
  phoneNumberId!: string;
  @ApiProperty({ required: false, description: 'Пусто — оставить сохранённый токен' })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  accessToken?: string;
  @ApiProperty({ description: 'Имя одобренного шаблона, например reminder_1h' })
  @IsString()
  @Matches(/^[a-z0-9_]{0,512}$/, {
    message: 'Имя шаблона — латиница в нижнем регистре, цифры и «_».',
  })
  templateName!: string;
  @ApiProperty({ description: 'Язык шаблона, например ru' })
  @IsString()
  @Matches(/^[a-z]{2,3}(_[A-Z]{2})?$/, { message: 'Код языка, например ru или en_US.' })
  language!: string;
}
export class WhatsAppTestDto {
  @ApiProperty({ description: 'Номер для проверки, например +7 777 123 45 67' })
  @IsString()
  @Length(10, 30)
  phone!: string;
}
