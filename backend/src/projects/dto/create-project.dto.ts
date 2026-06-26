import {
  IsString, IsArray, IsOptional, IsBoolean, IsNumber,
  IsUrl, MaxLength, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
