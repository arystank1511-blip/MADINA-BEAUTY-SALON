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
  @ApiProperty({ example: '+7 700 000 00 00' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/^[+\d\s()-]{10,30}$/, { message: 'Укажите телефон, например +7 777 123 45 67.' })
  phone!: string;
  @ApiProperty({
    required: false,
    example: '03-15',
    description: 'День рождения ММ-ДД, по желанию',
  })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'День рождения в виде ММ-ДД.' })
  birthday?: string;
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
  @ApiProperty({
    required: false,
    description: 'Шаблон просьбы об отзыве: {{1}} имя, {{2}} ссылка',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{0,512}$/, {
    message: 'Имя шаблона — латиница в нижнем регистре, цифры и «_».',
  })
  reviewTemplate?: string;
  @ApiProperty({
    required: false,
    description: 'Шаблон «пора подстричься»: {{1}} имя, {{2}} ссылка',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{0,512}$/, {
    message: 'Имя шаблона — латиница в нижнем регистре, цифры и «_».',
  })
  returnTemplate?: string;
  @ApiProperty({ required: false, description: 'Шаблон поздравления: {{1}} имя, {{2}} скидка %' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{0,512}$/, {
    message: 'Имя шаблона — латиница в нижнем регистре, цифры и «_».',
  })
  birthdayTemplate?: string;
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
export class GrowthSettingsDto {
  @ApiProperty({ description: 'Ссылка на отзывы, например карточка 2GIS' })
  @IsString()
  @Matches(/^https:\/\/\S{3,500}$/, { message: 'Ссылка должна начинаться с https://' })
  reviewUrl!: string;
  @ApiProperty({ description: 'Через сколько недель после визита приглашать снова' })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(26)
  returnWeeks!: number;
  @ApiProperty({ description: 'Скидка в день рождения, %' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  birthdayDiscount!: number;
}
export class PaymentDto {
  @ApiProperty({ description: 'Фактически оплачено, в минимальных единицах (тиын)' })
  @IsInt()
  @Min(0)
  @Max(100000000)
  paidMinor!: number;
  @ApiProperty({ enum: ['CASH', 'KASPI'] })
  @IsIn(['CASH', 'KASPI'])
  paymentMethod!: 'CASH' | 'KASPI';
}
export class StatsQuery {
  @ApiProperty({ required: false, example: '2026-10-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;
  @ApiProperty({ required: false, example: '2026-10-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
export class ClientDto {
  @ApiProperty({ description: 'Заметка мастера: краска, пожелания' })
  @IsString()
  @Length(0, 2000)
  note!: string;
  @ApiProperty({ required: false, nullable: true, example: '03-15', description: 'ММ-ДД' })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'День рождения в виде ММ-ДД.' })
  birthday?: string | null;
  @ApiProperty() @IsBoolean() blocked!: boolean;
}
export class ClientsQuery {
  @ApiProperty({ required: false, description: 'Имя или часть номера' })
  @IsOptional()
  @IsString()
  @Length(0, 80)
  q?: string;
}
export class PhotoDto {
  @ApiProperty({ description: 'Изображение в base64 (без префикса data:)' })
  @IsString()
  @Length(100, 4000000)
  data!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mime!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  caption?: string;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) width!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(10000) height!: number;
}
export class CaptionDto {
  @ApiProperty() @IsString() @Length(0, 200) caption!: string;
}
export class PromoDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ example: 'Стрижка + укладка −20% по вторникам' })
  @IsString()
  @Length(0, 200)
  text!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: '2026-10-31',
    description: 'Показывать по эту дату',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  until?: string | null;
}
class PushKeysDto {
  @ApiProperty() @IsString() @Length(10, 200) p256dh!: string;
  @ApiProperty() @IsString() @Length(5, 100) auth!: string;
}
export class PushEndpointDto {
  @ApiProperty()
  @IsString()
  @Length(10, 1000)
  @Matches(/^https:\/\//, { message: 'Адрес подписки должен быть https.' })
  endpoint!: string;
}
export class PushSubscriptionDto extends PushEndpointDto {
  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
export class MasterLoginDto {
  @ApiProperty({ example: 'nurgul@madina.kz' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
  @ApiProperty({ description: 'Не короче 10 символов' })
  @IsString()
  @Length(10, 128)
  password!: string;
}
export class RescheduleDto {
  @ApiProperty({ example: '2030-01-07T10:00:00+05:00' })
  @IsDateString({ strict: true })
  startsAt!: string;
}
export class WaitlistDto {
  @ApiProperty({ example: '2026-10-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  serviceId?: string;
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name!: string;
  @ApiProperty()
  @IsString()
  @Matches(/^[+\d\s()-]{10,30}$/, { message: 'Укажите телефон, например +7 777 123 45 67.' })
  phone!: string;
}
