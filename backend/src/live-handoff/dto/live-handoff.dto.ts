import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLiveHandoffDto {
  @ApiPropertyOptional({ description: 'UI language code of the visitor (e.g. it, en, sq, es, pt, fr, de)' })
  @IsString()
  @IsOptional()
  @MaxLength(5)
  locale?: string;

  @ApiPropertyOptional({ description: "Visitor's last chat message, included in the notification email as context" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  lastUserMessage?: string;
}
