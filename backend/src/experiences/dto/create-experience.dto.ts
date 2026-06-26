import {
  IsString, IsArray, IsOptional, IsBoolean, IsNumber, MaxLength, MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExperienceDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  @MaxLength(120)
  company: string;

  @ApiProperty({ example: 'Senior Angular Developer' })
  @IsString()
  @MaxLength(120)
  role: string;

  @ApiProperty({ example: '2022-01' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ example: '2024-03' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  current?: boolean;

  @ApiProperty({ example: 'Led a team of 5 engineers to deliver...' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional({ example: ['Angular', 'TypeScript', 'RxJS'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  technologies?: string[];

  @ApiPropertyOptional({ example: 'Remote' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  order?: number;
}
