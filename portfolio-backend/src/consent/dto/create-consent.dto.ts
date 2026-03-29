import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateConsentDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  country: string;

  @IsBoolean()
  analytics: boolean;

  @IsBoolean()
  marketing: boolean;

  @IsBoolean()
  preferences: boolean;
}
