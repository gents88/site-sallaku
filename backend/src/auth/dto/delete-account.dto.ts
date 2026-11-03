import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MAX } from '../password-policy';

export class DeleteAccountDto {
  /** Obbligatoria se l'account ha una password; gli account solo-OTP non ce l'hanno. */
  @ApiPropertyOptional({ example: 'StrongPass123!' })
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX)
  password?: string;
}
