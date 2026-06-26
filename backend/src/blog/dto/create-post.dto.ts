import {
  IsString, IsArray, IsOptional, IsBoolean, MaxLength, MinLength, Matches, IsIn, IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BLOG_LANGUAGES, BlogLanguage } from '../blog.constants';

export class CreatePostDto {
  @ApiProperty({ example: 'Building a CMS with NestJS' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'A practical guide to turning source material into readable content.' })
  @IsString()
  @IsOptional()
  @MaxLength(220)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'building-a-cms-with-nestjs' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @ApiProperty({ example: '## Introduction\n\nIn this post...' })
  @IsString()
  @MinLength(10)
  content: string;

  @ApiPropertyOptional({ example: 'A quick look at building a CMS...' })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt?: string;

  @ApiPropertyOptional({ enum: BLOG_LANGUAGES, example: 'en' })
  @IsIn(BLOG_LANGUAGES)
  @IsOptional()
  language?: BlogLanguage;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cover.jpg' })
  @IsUrl({ protocols: ['https', 'http'], require_tld: true }, { message: 'coverImage must be a valid URL' })
  @MaxLength(500)
  @IsOptional()
  coverImage?: string;

  @ApiPropertyOptional({ example: ['nestjs', 'mongodb', 'tutorial'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  published?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  metaDescription?: string;

  // ── Multilanguage translations ─────────────────────────────
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_en?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_sq?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_en?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_sq?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_en?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_sq?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_pt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_pt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_pt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_es?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_es?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_es?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_fr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_fr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_fr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title_de?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  content_de?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(300)
  excerpt_de?: string;
}
