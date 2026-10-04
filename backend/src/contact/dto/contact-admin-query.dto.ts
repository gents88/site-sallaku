import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
