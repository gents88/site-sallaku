import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { applyRefreshCookie, clearRefreshCookie, readRefreshCookie, refreshCookieEnabled } from './refresh-cookie';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // 5 registration attempts per 60 seconds per IP — prevents account enumeration spam
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // 10 login attempts per 60 seconds per IP — brute force protection
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login and receive JWT access + refresh tokens' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return applyRefreshCookie(res, await this.authService.login(dto));
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  // Tighter throttle: OTP delivery has a cost, limit abuse
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a one-time password via SMS or email' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone, dto.email);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify OTP and receive JWT access + refresh tokens' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    return applyRefreshCookie(res, await this.authService.verifyOtp(dto.phone, dto.email, dto.otp));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Obtain a new access token using a valid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: ExpressRequest, @Res({ passthrough: true }) res: Response) {
    // Body (modalità classica) o cookie httpOnly (AUTH_REFRESH_COOKIE=true).
    const token = dto.refreshToken ?? (refreshCookieEnabled() ? readRefreshCookie(req) : undefined);
    if (!token) throw new UnauthorizedException('Missing refresh token');
    return applyRefreshCookie(res, await this.authService.refreshAccessToken(token));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @SkipThrottle()
  @ApiOperation({ summary: 'Invalidate the current session refresh token' })
  logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    if (refreshCookieEnabled()) clearRefreshCookie(res);
    return this.authService.logout(req.user._id.toString());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@Request() req: any) {
    // Return only non-sensitive fields — never return passwordHash or refreshTokenHash
    const { _id, name, email, role } = req.user;
    return { _id, name, email, role };
  }
}
