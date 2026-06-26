import { IsString, IsEmail, IsOptional, Matches, Length, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Phone number in E.164 format (use this OR email)',
    example: '+12025551234',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Phone must be in E.164 format' })
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

  @ApiProperty({
    description: 'Six-digit OTP code received via SMS or email',
    example: '483920',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only digits' })
  otp: string;
}
