import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LEAD_STATUSES, LeadStatus } from '../lead';
import { Transform } from 'class-transformer';
import { PageLimitDto } from '../../common/dto/pagination.dto';

export class ContactAdminQueryDto extends PageLimitDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  /** Ricerca nell'inbox: nome, email, oggetto, messaggio. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: LeadStatus;

  /** Solo i follow-up scaduti o di oggi, ancora aperti. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  followUpsDue?: boolean;
}
