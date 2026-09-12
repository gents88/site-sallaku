import { IsIn, IsOptional } from 'class-validator';
import { PageLimitDto } from '../../common/dto/pagination.dto';
import { NewsletterStatus } from '../schemas/newsletter-subscriber.schema';

export class NewsletterAdminQueryDto extends PageLimitDto {
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'unsubscribed'])
  status?: NewsletterStatus;
}
