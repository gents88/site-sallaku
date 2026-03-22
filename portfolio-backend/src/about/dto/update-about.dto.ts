import {
  IsString, IsArray, IsOptional, IsUrl, MaxLength, ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class SocialsDto {
  @IsUrl() @IsOptional() github?: string;
  @IsUrl() @IsOptional() linkedin?: string;
  @IsUrl() @IsOptional() twitter?: string;
  @IsString() @IsOptional() email?: string;
}

export class UpdateAboutDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) headline?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() bio?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() location?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() avatarUrl?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() resumeUrl?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() skills?: string[];
  @ApiPropertyOptional() @ValidateNested() @Type(() => SocialsDto) @IsOptional() socials?: SocialsDto;
}
