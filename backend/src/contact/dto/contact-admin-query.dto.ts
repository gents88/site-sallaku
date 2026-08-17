import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { PageLimitDto } from '../../common/dto/pagination.dto';

export class ContactAdminQueryDto extends PageLimitDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}
