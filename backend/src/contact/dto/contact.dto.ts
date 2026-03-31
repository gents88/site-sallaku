import { IsString, IsEmail, MaxLength, MinLength, IsArray, ArrayNotEmpty, ArrayMaxSize, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Project Inquiry' })
  @IsString()
  @MaxLength(150)
  subject: string;

  @ApiProperty({ example: 'Hi, I would like to discuss...' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message: string;

  /**
   * Honeypot field — must be empty. Bots that auto-fill all inputs are rejected.
   * Not shown in the UI but validated server-side as a second line of defense.
   */
  @ApiPropertyOptional({ description: 'Leave empty (anti-bot honeypot)' })
  @IsOptional()
  @IsString()
  @MaxLength(0, { message: 'Bot detected' })
  website?: string;
}

export class ReplyContactDto {
  @ApiProperty({ example: 'Thank you for reaching out! I will get back to you soon.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  replyText: string;
}

export class BulkDeleteDto {
  @ApiProperty({ example: ['64abc123', '64abc456'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}
