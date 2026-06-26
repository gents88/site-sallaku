import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BLOG_LANGUAGES, BlogLanguage } from '../blog.constants';

export class GenerateBlogFromPdfDto {
  @ApiProperty({ enum: BLOG_LANGUAGES, example: 'en' })
  @IsIn(BLOG_LANGUAGES)
  language: BlogLanguage;

  @ApiPropertyOptional({
    example: 'Keep the tone practical and suitable for a technical audience.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  context?: string;
}