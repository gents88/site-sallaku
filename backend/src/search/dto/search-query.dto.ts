import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { BLOG_LANGUAGES, BlogLanguage } from '../../blog/blog.constants';
import { SearchHitType } from '../interfaces/search.interface';

const SEARCH_TYPES: SearchHitType[] = ['post', 'project'];

export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q: string;

  @IsOptional()
  @IsIn(BLOG_LANGUAGES)
  lang?: BlogLanguage;

  @IsOptional()
  @IsIn(SEARCH_TYPES)
  type?: SearchHitType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
