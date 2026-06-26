import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}