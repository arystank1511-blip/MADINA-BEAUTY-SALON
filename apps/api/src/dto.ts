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
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() masterId?: string;
  @ApiProperty({ required: false, example: '2030-01-07T10:00:00+05:00' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(offset)
  startsAt?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 80)
  name?: string;
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
  @ApiProperty() @IsString() @Length(2, 150) name!: string;
  @ApiProperty() @IsString() @Length(0, 2000) description!: string;
  @ApiProperty() @IsInt() @Min(0) @Max(100000000) priceMinor!: number;
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
  @IsIn(['CONFIRMED', 'CANCELLED', 'COMPLETED'])
  status?: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
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
