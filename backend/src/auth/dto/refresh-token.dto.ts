import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  /** Assente in modalità cookie (AUTH_REFRESH_COOKIE=true): il token arriva dal cookie httpOnly. */
  @ApiPropertyOptional({ description: 'Refresh token issued at login (omit when using the httpOnly cookie)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
