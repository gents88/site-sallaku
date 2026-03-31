import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Valid refresh token issued at login' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
