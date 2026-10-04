import { IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCampaignDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(200) subject: string;
  @ApiProperty({ description: 'Corpo HTML (sanificato lato server)' }) @IsString() @MinLength(10) @MaxLength(200_000) html: string;
}

export class SendCampaignDto {
  @ApiPropertyOptional({ description: 'ISO date; assente = subito' }) @IsOptional() @IsDateString() scheduledAt?: string;
}

export class TestCampaignDto {
  @ApiProperty() @IsEmail() email: string;
}
