import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribeDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Honeypot field — must stay empty. Bots that auto-fill every input get rejected. */
  @ApiPropertyOptional({ description: 'Leave empty (anti-bot honeypot)' })
  @IsOptional()
  @IsString()
  @MaxLength(0, { message: 'Bot detected' })
  website?: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile response token' })
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
