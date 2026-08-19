import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { BLOG_LANGUAGES, BlogLanguage } from '../../blog/blog.constants';

export class SuggestQueryDto {
  @IsString()
  @MinLength(2)
  q: string;

  @IsOptional()
  @IsIn(BLOG_LANGUAGES)
  lang?: BlogLanguage;
}
