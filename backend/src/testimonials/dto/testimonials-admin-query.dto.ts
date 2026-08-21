import { IsIn, IsOptional } from 'class-validator';
import { SkipLimitDto } from '../../common/dto/pagination.dto';
import { TestimonialModerationStatus } from '../services/testimonials.service';

export class TestimonialsAdminQueryDto extends SkipLimitDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'spam', 'all'])
  status?: TestimonialModerationStatus;
}
