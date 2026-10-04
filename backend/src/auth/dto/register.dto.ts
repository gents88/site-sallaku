import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MAX, PASSWORD_MESSAGE, PASSWORD_MIN, PASSWORD_PATTERN } from '../password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'admin@portfolio.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX) // bcrypt silently truncates at 72 bytes
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string;
}
