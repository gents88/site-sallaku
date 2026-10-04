import {
  IsString, IsArray, IsOptional, IsBoolean, IsNumber,
  IsUrl, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectTranslationsDto } from './project-translations.dto';

export class CreateProjectDto {
  @ApiProperty({ example: 'Portfolio CMS' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiProperty({ example: 'A headless CMS built with NestJS and Angular.' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional({ example: ['Angular', 'NestJS', 'MongoDB'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  technologies?: string[];

  @ApiPropertyOptional({ example: ['https://cdn.example.com/img.jpg'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ example: 'https://myapp.com' })
  @IsUrl()
  @IsOptional()
  liveUrl?: string;

  @ApiPropertyOptional({ example: 'https://github.com/user/repo' })
  @IsUrl()
  @IsOptional()
  repoUrl?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Case study: il problema del cliente' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  problem?: string;

  @ApiPropertyOptional({ description: 'Case study: la soluzione realizzata' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  solution?: string;

  @ApiPropertyOptional({ description: 'Case study: risultati misurabili' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  results?: string;

  @ApiPropertyOptional({ type: ProjectTranslationsDto })
  @ValidateNested()
  @Type(() => ProjectTranslationsDto)
  @IsOptional()
  translations?: ProjectTranslationsDto;
}
