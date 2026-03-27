import { IsString, IsIn, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BLOG_LANGUAGES } from '../blog.constants';

export class TranslateTextDto {
  @ApiProperty({ example: 'Ciao mondo', description: 'Text to translate' })
  @IsString()
  @MinLength(1)
  text: string;

  @ApiProperty({ enum: BLOG_LANGUAGES, example: 'it' })
  @IsIn(BLOG_LANGUAGES)
  from: string;

  @ApiProperty({ enum: BLOG_LANGUAGES, example: 'en' })
  @IsIn(BLOG_LANGUAGES)
  to: string;
}
