import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateConsentDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsBoolean()
  analytics: boolean;

  @IsBoolean()
  marketing: boolean;

  @IsBoolean()
  preferences: boolean;
}
