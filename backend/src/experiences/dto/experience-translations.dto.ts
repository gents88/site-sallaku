import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Campi traducibili di un'esperienza (azienda e date restano uguali in tutte le lingue). */
export class ExperienceTranslationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) location?: string;
}

export class ExperienceTranslationsDto {
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) en?: ExperienceTranslationDto;
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) sq?: ExperienceTranslationDto;
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) es?: ExperienceTranslationDto;
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) pt?: ExperienceTranslationDto;
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) fr?: ExperienceTranslationDto;
  @ApiPropertyOptional({ type: ExperienceTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ExperienceTranslationDto) de?: ExperienceTranslationDto;
}
