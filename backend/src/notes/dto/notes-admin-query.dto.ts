import { IsIn, IsOptional } from 'class-validator';
import { SkipLimitDto } from '../../common/dto/pagination.dto';
import { NoteModerationStatus } from '../services/notes.service';

export class NotesAdminQueryDto extends SkipLimitDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'spam', 'all'])
  status?: NoteModerationStatus;
}
