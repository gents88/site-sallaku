import { IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'User message', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional({ description: 'Existing session ID to continue conversation' })
  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class SendTranscriptDto {
  @ApiProperty({ description: 'Session ID to send transcript for' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ description: 'Email address to send the transcript to' })
  @IsEmail()
  email: string;
}
