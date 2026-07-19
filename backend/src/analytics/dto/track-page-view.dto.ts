import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TrackPageViewDto {
  @IsUUID(4, { message: 'visitorId must be a valid UUID v4' })
  @IsNotEmpty()
  visitorId: string;

  @IsString()
  @IsNotEmpty()
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

  @IsOptional()
  @IsUUID(4, { message: 'viewId must be a valid UUID v4' })
  viewId?: string;

  @IsOptional()
  @IsUUID(4, { message: 'sessionId must be a valid UUID v4' })
  sessionId?: string;

  @IsOptional()
  @IsIn(['entry', 'internal'])
  navigationType?: 'entry' | 'internal';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmCampaign?: string;
}