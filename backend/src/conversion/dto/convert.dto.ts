import {
  IsString,
  IsIn,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SUPPORTED_CONVERSIONS = [
  // Documents
  'pdf-to-docx',
  'docx-to-pdf',
  'pdf-to-txt',
  'pdf-to-html',
  'html-to-pdf',
  'html-to-docx',
  'docx-to-txt',
  'docx-to-html',
  'txt-to-pdf',
  'txt-to-docx',
  'md-to-html',
  'md-to-pdf',
  // Images
  'jpg-to-png',
  'png-to-jpg',
  'png-to-webp',
  'webp-to-png',
  'image-to-pdf',
  'pdf-to-images',
  // Structured
  'pdf-to-json',
  'json-to-pdf',
  'pdf-to-csv',
  'csv-to-json',
  'json-to-csv',
  // Spreadsheet / Excel
  'csv-to-excel',
  'excel-to-csv',
  'excel-to-json',
  'excel-to-html',
  'excel-to-pdf',
  'csv-to-pdf',
  // Base64
  'base64-to-png',
  'base64-to-jpg',
  'base64-to-pdf',
  'file-to-base64',
  // Utilities
  'merge-pdf',
] as const;

export type ConversionType = (typeof SUPPORTED_CONVERSIONS)[number];

export class ConvertDto {
  @ApiProperty({ enum: ['file', 'base64', 'json'] })
  @IsString()
  @IsIn(['file', 'base64', 'json'])
  inputType: 'file' | 'base64' | 'json';

  @ApiProperty({ enum: SUPPORTED_CONVERSIONS })
  @IsString()
  @IsIn([...SUPPORTED_CONVERSIONS])
  conversionType: ConversionType;

  @ApiPropertyOptional({ description: 'Base64-encoded data or JSON string' })
  @IsOptional()
  @IsString()
  data?: string;

  @ApiPropertyOptional({ description: 'Extra options per converter' })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}

export class BatchConvertDto {
  @ApiProperty({ type: [ConvertDto] })
  @IsArray()
  jobs: ConvertDto[];
}
