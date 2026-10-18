import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAINTENANCE_MESSAGE_MAX } from '../../common/settings/feature-flags';

/** PATCH /system/flags: solo i campi da cambiare. */
export class UpdateFlagsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() maintenanceMode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAINTENANCE_MESSAGE_MAX)
  maintenanceMessage?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() chatbotEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() liveHandoffEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() registrationEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() newsletterSignupEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() contactFormEnabled?: boolean;
}
