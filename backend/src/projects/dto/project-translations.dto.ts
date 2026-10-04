import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Campi traducibili di un progetto. L'italiano resta nei campi base. */
export class ProjectTranslationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) problem?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) solution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) results?: string;
}

/**
 * Una chiave per lingua non predefinita (stesse del blog). Classe esplicita
 * invece di una mappa libera: con whitelist + forbidNonWhitelisted una lingua
 * sconosciuta o un campo inatteso vengono rifiutati.
 */
export class ProjectTranslationsDto {
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) en?: ProjectTranslationDto;
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) sq?: ProjectTranslationDto;
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) es?: ProjectTranslationDto;
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) pt?: ProjectTranslationDto;
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) fr?: ProjectTranslationDto;
  @ApiPropertyOptional({ type: ProjectTranslationDto }) @IsOptional() @ValidateNested() @Type(() => ProjectTranslationDto) de?: ProjectTranslationDto;
}
