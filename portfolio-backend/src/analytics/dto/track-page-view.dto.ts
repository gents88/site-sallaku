import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @MaxLength(120)
  visitorId: string;

  @IsString()
  @MaxLength(300)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  userAgent?: string;
}