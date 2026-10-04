import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PASSWORD_MAX, PASSWORD_MESSAGE, PASSWORD_MIN, PASSWORD_PATTERN } from '../../auth/password-policy';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageLimitDto } from '../../common/dto/pagination.dto';
import { Role } from '../../auth/decorators/roles.decorator';

export class UsersAdminQueryDto extends PageLimitDto {
  @ApiPropertyOptional({ description: 'Cerca in nome, email, telefono' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsIn(Object.values(Role))
  role: Role;
}

/** Telefono in formato E.164, come per il login OTP via SMS. */
const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

/**
 * Creazione utente da admin. La password è facoltativa: senza, l'utente
 * accede con il codice OTP via email/SMS. `emailVerified` di default true:
 * è l'admin a garantire l'indirizzo.
 */
export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(60) name: string;
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiPropertyOptional({ example: '+393331234567' }) @IsOptional() @Matches(PHONE_PATTERN, { message: 'phone must be in E.164 format, e.g. +393331234567' }) phone?: string;
  @ApiProperty({ enum: Role }) @IsIn(Object.values(Role)) role: Role;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(PASSWORD_MIN) @MaxLength(PASSWORD_MAX) @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE }) password?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() emailVerified?: boolean;
}

/** Modifica del profilo (il ruolo ha un endpoint dedicato con le sue protezioni). */
export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  /** Stringa vuota = rimuovi il telefono. */
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== '') @Matches(PHONE_PATTERN, { message: 'phone must be in E.164 format, e.g. +393331234567' }) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailVerified?: boolean;
}

export class SetPasswordDto {
  @ApiProperty() @IsString() @MinLength(PASSWORD_MIN) @MaxLength(PASSWORD_MAX) @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE }) password: string;
}
