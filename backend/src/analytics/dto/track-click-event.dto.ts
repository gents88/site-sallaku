import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TrackClickEventDto {
  @IsUUID(4, { message: 'visitorId must be a valid UUID v4' })
  @IsNotEmpty()
  visitorId: string;

  /** 'cta' | 'affiliate' | 'social' | 'blog' | 'project' | 'contact' | 'cv_download' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  eventType: string;

  /** Unique identifier of the clicked element, e.g. 'hero_contact_btn' */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  label: string;

  /** Current page path */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  language?: string;
}
