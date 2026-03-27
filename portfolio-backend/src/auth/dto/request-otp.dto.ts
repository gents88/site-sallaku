import { IsString, IsEmail, IsOptional, Matches, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format (use this OR email)',
    example: '+12025551234',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Phone must be in E.164 format, e.g. +12025551234',
  })
  @ValidateIf(o => !o.email)
  phone?: string;

  @ApiProperty({
    description: 'Email address (use this OR phone)',
    example: 'admin@portfolio.com',
    required: false,
  })
  @IsOptional()
  @IsEmail({}, { message: 'Must be a valid email address' })
  @ValidateIf(o => !o.phone)
  email?: string;
}
