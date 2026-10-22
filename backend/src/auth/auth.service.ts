import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Types } from 'mongoose';
import { ClientContext, SecurityService } from '../security/security.service';

const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_REFRESH_ROUNDS = 10;

/** Per chi chiama senza contesto (script, test): gli eventi si registrano comunque, senza IP. */
const NO_CONTEXT: ClientContext = { ip: '', userAgent: '' };

/**
 * bcrypt considera solo i primi 72 byte. Un refresh token JWT ne ha ~116 e i
 * primi 72 (header + inizio del payload) sono uguali per tutti i token dello
 * stesso utente: confrontando il token grezzo, bcrypt accettava anche un token
 * già ruotato e il rilevamento del riuso non scattava mai. Si salva e confronta
 * lo SHA-256 (64 caratteri), che dipende dall'intero token.
 */
function refreshTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Minimum shape required to issue a JWT pair. */
interface AuthUser {
  _id: Types.ObjectId;
  name?: string;
  email?: string | null;
  role: string;
  refreshTokenHash?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
    private security: SecurityService,
  ) {}

  /**
   * Creates the account but does not log it in yet: the email is unproven at
   * this point, so we don't hand out tokens (or send the welcome email —
   * see OtpService.verifyOtp) for an address the registrant may not own.
   * Instead this sends a verification OTP; the frontend lands the user on
   * the OTP-verify step, and a successful check there both confirms the
   * email and issues the token pair.
   */
  async register(dto: RegisterDto): Promise<{ message: string; email: string }> {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'user',
    });

    try {
      await this.otpService.requestOtp(undefined, dto.email);
    } catch (err) {
      // Senza codice l'account non si può verificare: lo si annulla, così chi
      // riprova non trova "Email already registered" su un account inservibile.
      await this.usersService.deleteById(user._id.toString());
      throw err;
    }

    return {
      message: 'Account created. Check your email for a verification code.',
      email: dto.email,
    };
  }

  async login(dto: LoginDto, ctx: ClientContext = NO_CONTEXT) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.security.record('login_failed', ctx, { identifier: dto.email, detail: 'account inesistente' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      await this.security.record('login_failed', ctx, { userId: user._id.toString(), identifier: dto.email, detail: 'password errata' });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      await this.security.record('login_failed', ctx, { userId: user._id.toString(), identifier: dto.email, detail: 'email non verificata' });
      throw new UnauthorizedException('Please verify your email before logging in. Check your inbox for the verification code.');
    }

    const pair = await this.issueTokenPair(user);
    await this.signedIn(user._id.toString(), ctx, 'password');
    return pair;
  }

  otpChannels() {
    return this.otpService.channels();
  }

  async requestOtp(phone?: string, email?: string): Promise<{ message: string }> {
    return this.otpService.requestOtp(phone, email);
  }

  async verifyOtp(phone?: string, email?: string, otp?: string, ctx: ClientContext = NO_CONTEXT) {
    let user;
    try {
      user = await this.otpService.verifyOtp(phone, email, otp);
    } catch (err) {
      // Codice sbagliato, scaduto o troppi tentativi: solo gli Unauthorized sono tentativi falliti.
      if (err instanceof UnauthorizedException) {
        await this.security.record('otp_failed', ctx, { identifier: email ?? phone, detail: err.message });
      }
      throw err;
    }
    const pair = await this.issueTokenPair(user);
    await this.signedIn(user._id.toString(), ctx, 'otp');
    return pair;
  }

  /**
   * Verify a refresh token and issue a new access token + rotated refresh token.
   * The old refresh token is invalidated on each call (rotation).
   */
  async refreshAccessToken(refreshToken: string, ctx: ClientContext = NO_CONTEXT) {
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

    const hashMatch = await bcrypt.compare(refreshTokenDigest(refreshToken), user.refreshTokenHash);
    if (!hashMatch) {
      // Potential token reuse — revoke immediately (token rotation security)
      await this.usersService.saveRefreshToken(payload.sub, null);
      await this.security.endSession(payload.sub);
      await this.security.record('refresh_reuse', ctx, { userId: payload.sub, identifier: payload.email, detail: 'token già ruotato: sessione chiusa' });
      throw new UnauthorizedException('Refresh token reuse detected. Please log in again.');
    }

    // Rotate: issue new pair and revoke old refresh token
    const pair = await this.issueTokenPair(user);
    await this.security.touchSession(payload.sub, ctx);
    return pair;
  }

  /** Revoke the stored refresh token for a user (logout). */
  async logout(userId: string): Promise<void> {
    await this.usersService.saveRefreshToken(userId, null);
    await this.security.endSession(userId);
  }

  // ── Internal helpers ───────────────────────────────────────

  /** Accesso riuscito: lo si registra e la sessione (dispositivo, IP) parte da adesso. */
  private async signedIn(userId: string, ctx: ClientContext, method: 'password' | 'otp'): Promise<void> {
    await this.security.record('login_success', ctx, { userId, detail: method === 'otp' ? 'codice OTP' : 'password' });
    await this.security.startSession(userId, ctx);
  }

  private async issueTokenPair(user: AuthUser) {
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
    const hash = await bcrypt.hash(refreshTokenDigest(refresh_token), BCRYPT_REFRESH_ROUNDS);
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
