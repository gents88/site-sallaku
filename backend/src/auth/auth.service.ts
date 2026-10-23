import {
  Injectable,
  HttpException,
  HttpStatus,
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
import { CacheService } from '../common/services/cache.service';

/** Identica per account nuovo ed esistente: vedi register(). */
const REGISTER_MESSAGE = 'Account created. Check your email for a verification code.';

const REFRESH_TOKEN_EXPIRY = '7d';
const BCRYPT_REFRESH_ROUNDS = 10;

/**
 * Dopo una rotazione il refresh token sostituito resta valido per qualche secondo: due schede (o la
 * stessa scheda che riprova) che rinnovano insieme presentano lo stesso token, e la seconda non deve
 * essere scambiata per un furto: riceve un nuovo access token e il refresh token non cambia.
 * Oltre la finestra un token già ruotato è un riuso e chiude la sessione.
 */
export const REFRESH_REUSE_GRACE_MS = 20_000;

/** Tentativi prima di rinunciare: ogni giro rilegge la sessione dopo aver perso la gara di rotazione. */
const REFRESH_ROTATION_ATTEMPTS = 3;

/**
 * Blocco temporaneo per account: il throttle per IP (10/min) non ferma chi
 * prova una password da molti IP. Dopo MAX_FAILED_LOGINS errori nella finestra
 * l'email viene rifiutata fino alla scadenza, anche con la password giusta.
 * Il costo è che un attaccante può bloccare un account per LOGIN_LOCK_WINDOW_MS:
 * accettabile, perché scade da solo e l'accesso via OTP resta disponibile.
 */
export const MAX_FAILED_LOGINS = 10;
export const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;

/**
 * Hash di una stringa casuale, mai usata da nessuno. Serve a fare lo stesso
 * lavoro di bcrypt anche quando l'email non esiste, così il tempo di risposta
 * non rivela quali account sono registrati.
 */
const DUMMY_PASSWORD_HASH = '$2b$12$Lni2l4f2dZSqw2LgrLHZFOV7EuV5Ho3Joqcv3KGPx/WbY5kny5eCK';

function loginFailureKey(email: string): string {
  return `auth:login-fail:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24)}`;
}

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

/** Risposta di login e rinnovo. `refresh_token` manca quando il rinnovo non ruota il token (vedi refreshSession). */
export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  user: { _id: unknown; name?: string; email: string | null; role: string };
}

/** Contenuto di un refresh token: `sid` manca nei token emessi prima del multi-dispositivo. */
interface RefreshPayload {
  sub: string;
  email: string;
  role: string;
  type?: string;
  sid?: string;
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
    private cache: CacheService,
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
    if (exists) {
      // Una risposta "email già registrata" permette a chiunque di scoprire chi ha un account
      // (basta provare indirizzi). Si risponde come per una registrazione nuova e si manda il
      // codice: se l'indirizzo è del titolare dell'account, col codice entra (accesso via OTP);
      // se non lo è, riceve solo una email e chi ha richiesto non impara nulla. L'hash serve a
      // non far trapelare l'esistenza dal tempo di risposta. Gli errori dell'invio (limite di
      // richieste, provider) restano gli stessi di una registrazione nuova.
      await bcrypt.hash(dto.password, 12);
      await this.otpService.requestOtp(undefined, dto.email);
      return { message: REGISTER_MESSAGE, email: dto.email };
    }

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

    return { message: REGISTER_MESSAGE, email: dto.email };
  }

  async login(dto: LoginDto, ctx: ClientContext = NO_CONTEXT) {
    const failureKey = loginFailureKey(dto.email);
    if ((await this.cache.getCounter(failureKey)) >= MAX_FAILED_LOGINS) {
      await this.security.record('login_failed', ctx, { identifier: dto.email, detail: 'account bloccato per troppi tentativi' });
      throw new HttpException('Too many failed login attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      await this.cache.increment(failureKey, 1, LOGIN_LOCK_WINDOW_MS);
      await this.security.record('login_failed', ctx, { identifier: dto.email, detail: 'account inesistente' });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      await this.cache.increment(failureKey, 1, LOGIN_LOCK_WINDOW_MS);
      await this.security.record('login_failed', ctx, { userId: user._id.toString(), identifier: dto.email, detail: 'password errata' });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.cache.invalidate(failureKey);

    if (!user.emailVerified) {
      await this.security.record('login_failed', ctx, { userId: user._id.toString(), identifier: dto.email, detail: 'email non verificata' });
      throw new UnauthorizedException('Please verify your email before logging in. Check your inbox for the verification code.');
    }

    const pair = await this.openSession(user, ctx);
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
    const pair = await this.openSession(user, ctx);
    await this.signedIn(user._id.toString(), ctx, 'otp');
    return pair;
  }

  /**
   * Verify a refresh token and issue a new access token + rotated refresh token.
   * Ogni dispositivo ha la sua sessione (claim `sid`): rinnovare qui non tocca gli altri.
   */
  async refreshAccessToken(refreshToken: string, ctx: ClientContext = NO_CONTEXT): Promise<AuthTokens> {
    // Verify JWT structure and signature first
    let payload: RefreshPayload;
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

    const user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    if (!user) throw new UnauthorizedException('Refresh token has been revoked');

    return payload.sid
      ? this.refreshSession(user, payload.sid, refreshToken, payload, ctx)
      : this.refreshLegacy(user, refreshToken, payload, ctx);
  }

  /** Revoca la sessione di questo dispositivo (logout); gli altri restano collegati. */
  async logout(userId: string, sid?: string): Promise<void> {
    if (sid) {
      await this.security.endSession(userId, sid);
    } else {
      // Token emesso prima del multi-dispositivo: c'è solo il vecchio refresh token unico.
      await this.usersService.saveRefreshToken(userId, null);
    }
  }

  // ── Internal helpers ───────────────────────────────────────

  /** Accesso riuscito: lo si registra nel registro degli eventi di sicurezza. */
  private async signedIn(userId: string, ctx: ClientContext, method: 'password' | 'otp'): Promise<void> {
    await this.security.record('login_success', ctx, { userId, detail: method === 'otp' ? 'codice OTP' : 'password' });
  }

  /**
   * Rinnovo di una sessione per dispositivo.
   *
   * Solo UNA richiesta ruota il refresh token (confronto e scambio atomici). Se arriva lo stesso token
   * mentre un'altra richiesta lo ha già sostituito da pochi secondi (due schede, un tentativo ripetuto)
   * si restituisce solo un nuovo access token e il refresh token resta quello deciso dalla richiesta
   * vincente: ruotare anche qui creerebbe una gara su quale risposta il browser conserva, e il token
   * perdente smetterebbe di valere alla scadenza della tolleranza, disconnettendo l'utente.
   */
  private async refreshSession(user: AuthUser, sid: string, refreshToken: string, payload: RefreshPayload, ctx: ClientContext): Promise<AuthTokens> {
    const userId = user._id.toString();
    const digest = refreshTokenDigest(refreshToken);

    // Pochi tentativi: se la rotazione perde la gara, si rilegge e il token risulta "ritirato".
    for (let attempt = 0; attempt < REFRESH_ROTATION_ATTEMPTS; attempt++) {
      const session = await this.security.findRefreshSession(userId, sid);
      if (!session?.refreshTokenHash) throw new UnauthorizedException('Refresh token has been revoked');

      if (await bcrypt.compare(digest, session.refreshTokenHash)) {
        const pair = await this.rotateSession(user, sid, session.refreshTokenHash, ctx);
        if (pair) return pair;
        continue; // un'altra richiesta ha ruotato per prima: si rilegge
      }

      if (await this.isRecentlyRetired(session.retiredRefreshHashes, digest)) {
        return this.accessTokenOnly(user, sid);
      }

      // Token già ruotato e fuori tolleranza: possibile furto. Si chiude questo dispositivo, non gli altri.
      await this.security.endSession(userId, sid);
      await this.security.record('refresh_reuse', ctx, { userId, identifier: payload.email, detail: 'token già ruotato: sessione chiusa' });
      throw new UnauthorizedException('Refresh token reuse detected. Please log in again.');
    }
    throw new UnauthorizedException('Refresh token has been revoked');
  }

  /** Il token è stato sostituito da meno di REFRESH_REUSE_GRACE_MS? */
  private async isRecentlyRetired(retired: Array<{ hash: string; retiredAt: Date }> | undefined, digest: string): Promise<boolean> {
    const now = Date.now();
    for (const entry of retired ?? []) {
      if (now - new Date(entry.retiredAt).getTime() > REFRESH_REUSE_GRACE_MS) continue;
      if (await bcrypt.compare(digest, entry.hash)) return true;
    }
    return false;
  }

  /** Solo un nuovo access token (stessa sessione): il refresh token non cambia. */
  private accessTokenOnly(user: AuthUser, sid: string): AuthTokens {
    const access_token = this.jwtService.sign({ sub: user._id.toString(), email: user.email ?? null, role: user.role, sid });
    return {
      access_token,
      expires_in: 900, // 15 minutes in seconds
      user: { _id: user._id, name: user.name, email: user.email ?? null, role: user.role },
    };
  }

  /**
   * Refresh token emesso prima del multi-dispositivo (nessun `sid`): vale il vecchio hash unico
   * sull'utente. Al primo rinnovo passa al nuovo schema, così le sessioni già aperte al rilascio
   * non vengono chiuse.
   */
  private async refreshLegacy(user: AuthUser, refreshToken: string, payload: RefreshPayload, ctx: ClientContext): Promise<AuthTokens> {
    const userId = user._id.toString();
    if (!user.refreshTokenHash) throw new UnauthorizedException('Refresh token has been revoked');

    const hashMatch = await bcrypt.compare(refreshTokenDigest(refreshToken), user.refreshTokenHash);
    if (!hashMatch) {
      await this.usersService.saveRefreshToken(userId, null);
      await this.security.record('refresh_reuse', ctx, { userId, identifier: payload.email, detail: 'token già ruotato: sessione chiusa' });
      throw new UnauthorizedException('Refresh token reuse detected. Please log in again.');
    }

    await this.usersService.saveRefreshToken(userId, null);
    return this.openSession(user, ctx);
  }

  private newSessionId(): string {
    return randomBytes(12).toString('hex');
  }

  /** Nuovo accesso su un dispositivo: crea la sessione e restituisce la coppia di token. */
  private async openSession(user: AuthUser, ctx: ClientContext): Promise<AuthTokens> {
    const sid = this.newSessionId();
    const tokens = await this.buildTokens(user, sid);
    await this.security.createSession(user._id.toString(), sid, tokens.hash, ctx);
    return tokens.response;
  }

  /** Rinnovo: scambia l'hash della sessione. null se nel frattempo l'ha già ruotata un'altra richiesta. */
  private async rotateSession(user: AuthUser, sid: string, expectedHash: string, ctx: ClientContext): Promise<AuthTokens | null> {
    const tokens = await this.buildTokens(user, sid);
    const rotated = await this.security.rotateSession(user._id.toString(), sid, expectedHash, tokens.hash, ctx);
    return rotated ? tokens.response : null;
  }

  private async buildTokens(user: AuthUser, sid: string) {
    const accessPayload = {
      sub: user._id.toString(),
      email: user.email ?? null,
      role: user.role,
      sid,
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

    // Bcrypt dello SHA-256 del refresh token — mai il token in chiaro
    const hash = await bcrypt.hash(refreshTokenDigest(refresh_token), BCRYPT_REFRESH_ROUNDS);

    return {
      hash,
      response: {
        access_token,
        refresh_token,
        expires_in: 900, // 15 minutes in seconds
        user: {
          _id: user._id,
          name: user.name,
          email: user.email ?? null,
          role: user.role,
        },
      },
    };
  }
}
