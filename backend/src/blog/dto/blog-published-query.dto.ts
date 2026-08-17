import { IsOptional, IsString } from 'class-validator';
import { PageLimitDto } from '../../common/dto/pagination.dto';

export class BlogPublishedQueryDto extends PageLimitDto {
  @IsOptional()
  @IsString()
  tag?: string;
}
