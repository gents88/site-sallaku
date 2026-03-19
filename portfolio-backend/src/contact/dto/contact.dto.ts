import { IsString, IsEmail, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
