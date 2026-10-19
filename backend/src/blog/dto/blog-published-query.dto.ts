import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageLimitDto } from '../../common/dto/pagination.dto';
import { BLOG_LANGUAGES, BlogLanguage } from '../blog.constants';

export class BlogPublishedQueryDto extends PageLimitDto {
  @IsOptional()
  @IsString()
  tag?: string;

  /** Lingua della pagina: la lista omette titolo ed estratto delle altre lingue. */
  @IsOptional()
  @IsIn(BLOG_LANGUAGES)
  lang?: BlogLanguage;
}
