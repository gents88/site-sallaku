import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_REFRESH_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
    private otpService: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'user',
    });

    // Fire-and-forget welcome email
    this.mailService.sendWelcome(user.name, user.email);

    return this.issueTokenPair(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokenPair(user);
  }

  async requestOtp(phone?: string, email?: string): Promise<{ message: string }> {
    return this.otpService.requestOtp(phone, email);
  }

  async verifyOtp(phone?: string, email?: string, otp?: string) {
    const user = await this.otpService.verifyOtp(phone, email, otp);
    return this.issueTokenPair(user);
  }

  /**
   * Verify a refresh token and issue a new access token + rotated refresh token.
   * The old refresh token is invalidated on each call (rotation).
   */
  async refreshAccessToken(refreshToken: string) {
    // Verify JWT structure and signature first
    let payload: { sub: string; email: string; role: string; type?: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Load user and verify stored hash (prevents replay of revoked tokens)
    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const hashMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!hashMatch) {
      // Potential token reuse — revoke immediately (token rotation security)
      await this.usersService.saveRefreshToken(payload.sub, null);
      throw new UnauthorizedException('Refresh token reuse detected. Please log in again.');
    }

    // Rotate: issue new pair and revoke old refresh token
    return this.issueTokenPair(user);
  }

  /** Revoke the stored refresh token for a user (logout). */
  async logout(userId: string): Promise<void> {
    await this.usersService.saveRefreshToken(userId, null);
  }

  // ── Internal helpers ───────────────────────────────────────

  private async issueTokenPair(user: any) {
    const accessPayload = {
      sub: user._id.toString(),
      email: user.email ?? null,
      role: user.role,
    };

    const refreshPayload = {
      ...accessPayload,
      type: 'refresh',
      // Random jitter prevents identical tokens when issued in the same second
      jti: randomBytes(16).toString('hex'),
    };

    const access_token = this.jwtService.sign(accessPayload);
    const refresh_token = this.jwtService.sign(refreshPayload, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    // Store bcrypt hash of refresh token — never store plaintext
    const hash = await bcrypt.hash(refresh_token, BCRYPT_REFRESH_ROUNDS);
    await this.usersService.saveRefreshToken(user._id.toString(), hash);

    return {
      access_token,
      refresh_token,
      expires_in: 900, // 15 minutes in seconds
      user: {
        _id: user._id,
        name: user.name,
        email: user.email ?? null,
        role: user.role,
      },
    };
  }
}
