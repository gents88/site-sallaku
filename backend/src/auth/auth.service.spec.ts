import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService, MAX_FAILED_LOGINS } from './auth.service';
import { CacheService } from '../common/services/cache.service';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';
import { SecurityService } from '../security/security.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{
  _id: string; name: string; email: string; passwordHash: string;
  role: string; refreshTokenHash: string | null; emailVerified: boolean;
}> = {}) {
  return {
    _id: 'user-id-1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    role: 'user',
    refreshTokenHash: null,
    emailVerified: true,
    toString: () => 'user-id-1',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let otpService: jest.Mocked<OtpService>;
  let security: { record: jest.Mock; startSession: jest.Mock; touchSession: jest.Mock; endSession: jest.Mock };
  const ctx = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Chrome/120' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findByIdWithRefreshToken: jest.fn(),
            create: jest.fn(),
            deleteById: jest.fn(),
            saveRefreshToken: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-access-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
              if (key === 'JWT_SECRET') return 'test-secret-32-chars-long-minimum';
              return fallback;
            }),
          },
        },
        {
          provide: OtpService,
          useValue: {
            requestOtp: jest.fn(),
            verifyOtp: jest.fn(),
          },
        },
        {
          provide: SecurityService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            startSession: jest.fn().mockResolvedValue(undefined),
            touchSession: jest.fn().mockResolvedValue(undefined),
            endSession: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          // Contatori in memoria con la stessa semantica di CacheService (senza Redis).
          provide: CacheService,
          useValue: (() => {
            const counters = new Map<string, number>();
            return {
              getCounter: jest.fn(async (k: string) => counters.get(k) ?? 0),
              increment: jest.fn(async (k: string, by: number) => {
                counters.set(k, (counters.get(k) ?? 0) + by);
                return counters.get(k)!;
              }),
              invalidate: jest.fn(async (k: string) => void counters.delete(k)),
            };
          })(),
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    otpService = module.get(OtpService);
    security = module.get(SecurityService);
  });

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('crea l’utente non verificato, invia un OTP email e NON restituisce token', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const user = makeUser({ emailVerified: false });
      usersService.create.mockResolvedValue(user as any);
      otpService.requestOtp.mockResolvedValue({ message: 'OTP sent' });

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongPass123!',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com', role: 'user' }),
      );
      expect(otpService.requestOtp).toHaveBeenCalledWith(undefined, 'test@example.com');
      expect(result).toEqual({ message: expect.any(String), email: 'test@example.com' });
      expect(result).not.toHaveProperty('access_token');
    });

    it('annulla l’account appena creato se il codice di verifica non parte', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(makeUser({ emailVerified: false }) as any);
      otpService.requestOtp.mockRejectedValue(new BadRequestException('Failed to send email.'));

      await expect(
        service.register({ name: 'X', email: 'test@example.com', password: 'StrongPass123!' }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.deleteById).toHaveBeenCalledWith('user-id-1');
    });

    it('should throw ConflictException if email already registered', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser() as any);

      await expect(
        service.register({ name: 'X', email: 'test@example.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
      expect(otpService.requestOtp).not.toHaveBeenCalled();
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return token pair for valid credentials', async () => {
      const rawPassword = 'MyPassword1!';
      const hash = await bcrypt.hash(rawPassword, 10);
      const user = makeUser({ passwordHash: hash });
      usersService.findByEmail.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      const result = await service.login({ email: user.email, password: rawPassword });

      expect(result).toHaveProperty('access_token');
      expect(result.user.email).toBe(user.email);
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correct-pass', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }) as any);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong-pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when the email has not been verified yet', async () => {
      const rawPassword = 'MyPassword1!';
      const hash = await bcrypt.hash(rawPassword, 10);
      const user = makeUser({ passwordHash: hash, emailVerified: false });
      usersService.findByEmail.mockResolvedValue(user as any);

      await expect(
        service.login({ email: user.email, password: rawPassword }),
      ).rejects.toThrow(UnauthorizedException);
    });

    describe('blocco dopo troppi tentativi', () => {
      const email = 'victim@example.com';

      async function failTimes(n: number): Promise<void> {
        usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: await bcrypt.hash('correct-pass', 4) }) as any);
        for (let i = 0; i < n; i++) {
          await expect(service.login({ email, password: 'wrong-pass' })).rejects.toThrow(UnauthorizedException);
        }
      }

      it('dopo MAX_FAILED_LOGINS errori risponde 429 e non controlla più la password', async () => {
        await failTimes(MAX_FAILED_LOGINS);
        usersService.findByEmail.mockClear();

        const attempt = service.login({ email, password: 'correct-pass' });
        await expect(attempt).rejects.toMatchObject({ status: 429 });
        expect(usersService.findByEmail).not.toHaveBeenCalled();
      });

      it('un tentativo in meno del limite non blocca: la password giusta entra', async () => {
        await failTimes(MAX_FAILED_LOGINS - 1);
        usersService.saveRefreshToken.mockResolvedValue(undefined as any);

        await expect(service.login({ email, password: 'correct-pass' })).resolves.toHaveProperty('access_token');
      });

      it('un login riuscito azzera il contatore', async () => {
        await failTimes(MAX_FAILED_LOGINS - 1);
        usersService.saveRefreshToken.mockResolvedValue(undefined as any);
        await service.login({ email, password: 'correct-pass' });

        await failTimes(MAX_FAILED_LOGINS - 1);
        await expect(service.login({ email, password: 'correct-pass' })).resolves.toHaveProperty('access_token');
      });

      it('conta anche le email inesistenti, così il blocco non rivela quali account esistono', async () => {
        usersService.findByEmail.mockResolvedValue(null);
        for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
          await expect(service.login({ email: 'ghost@example.com', password: 'x' })).rejects.toThrow(UnauthorizedException);
        }
        await expect(service.login({ email: 'ghost@example.com', password: 'x' })).rejects.toMatchObject({ status: 429 });
      });

      it('il blocco vale per email: un altro account non è toccato', async () => {
        await failTimes(MAX_FAILED_LOGINS);
        usersService.saveRefreshToken.mockResolvedValue(undefined as any);
        usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: await bcrypt.hash('pw', 4) }) as any);

        await expect(service.login({ email: 'other@example.com', password: 'pw' })).resolves.toHaveProperty('access_token');
      });

      it('maiuscole e spazi nell’email non aggirano il contatore', async () => {
        await failTimes(MAX_FAILED_LOGINS);
        await expect(service.login({ email: '  VICTIM@Example.com ', password: 'correct-pass' })).rejects.toMatchObject({ status: 429 });
      });
    });
  });

  // ── registro eventi di sicurezza e sessioni ─────────────────────────────────

  describe('security events', () => {
    it('login riuscito: registra l’evento e avvia la sessione con IP e dispositivo', async () => {
      const hash = await bcrypt.hash('MyPassword1!', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }) as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.login({ email: 'test@example.com', password: 'MyPassword1!' }, ctx);

      expect(security.record).toHaveBeenCalledWith('login_success', ctx, expect.objectContaining({ userId: 'user-id-1' }));
      expect(security.startSession).toHaveBeenCalledWith('user-id-1', ctx);
    });

    it('login fallito: email sconosciuta, password errata ed email non verificata sono tutti registrati', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);
      await expect(service.login({ email: 'x@example.com', password: 'p' }, ctx)).rejects.toThrow(UnauthorizedException);
      expect(security.record).toHaveBeenLastCalledWith('login_failed', ctx, expect.objectContaining({ identifier: 'x@example.com', detail: 'account inesistente' }));

      const hash = await bcrypt.hash('giusta', 10);
      usersService.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash }) as any);
      await expect(service.login({ email: 'test@example.com', password: 'sbagliata' }, ctx)).rejects.toThrow(UnauthorizedException);
      expect(security.record).toHaveBeenLastCalledWith('login_failed', ctx, expect.objectContaining({ userId: 'user-id-1', detail: 'password errata' }));

      usersService.findByEmail.mockResolvedValueOnce(makeUser({ passwordHash: hash, emailVerified: false }) as any);
      await expect(service.login({ email: 'test@example.com', password: 'giusta' }, ctx)).rejects.toThrow(UnauthorizedException);
      expect(security.record).toHaveBeenLastCalledWith('login_failed', ctx, expect.objectContaining({ detail: 'email non verificata' }));

      expect(security.startSession).not.toHaveBeenCalled();
    });

    it('un login fallito non rivela nulla in più al chiamante', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(service.login({ email: 'x@example.com', password: 'p' }, ctx)).rejects.toThrow('Invalid credentials');
    });

    it('OTP sbagliato: registra otp_failed e rilancia lo stesso errore', async () => {
      const err = new UnauthorizedException('Invalid OTP code. 4 attempts remaining.');
      otpService.verifyOtp.mockRejectedValue(err);

      await expect(service.verifyOtp(undefined, 'a@example.com', '000000', ctx)).rejects.toBe(err);

      expect(security.record).toHaveBeenCalledWith('otp_failed', ctx, expect.objectContaining({ identifier: 'a@example.com' }));
      expect(security.startSession).not.toHaveBeenCalled();
    });

    it('un errore OTP che non è un rifiuto (es. database giù) non finisce tra i tentativi falliti', async () => {
      otpService.verifyOtp.mockRejectedValue(new Error('db down'));
      await expect(service.verifyOtp(undefined, 'a@example.com', '1', ctx)).rejects.toThrow('db down');
      expect(security.record).not.toHaveBeenCalled();
    });

    it('OTP corretto: registra l’accesso e avvia la sessione', async () => {
      otpService.verifyOtp.mockResolvedValue(makeUser() as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.verifyOtp(undefined, 'test@example.com', '123456', ctx);

      expect(security.record).toHaveBeenCalledWith('login_success', ctx, expect.objectContaining({ detail: 'codice OTP' }));
      expect(security.startSession).toHaveBeenCalledWith('user-id-1', ctx);
    });

    it('riuso di un refresh token: registra l’evento e chiude la sessione', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash('un-altro', 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await expect(service.refreshAccessToken('riusato', ctx)).rejects.toThrow('reuse detected');

      expect(security.record).toHaveBeenCalledWith('refresh_reuse', ctx, expect.objectContaining({ userId: 'user-id-1' }));
      expect(security.endSession).toHaveBeenCalledWith('user-id-1');
    });

    it('rinnovo valido: aggiorna l’ultima attività senza registrare un evento', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash(sha256('raw-refresh-token'), 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.refreshAccessToken('raw-refresh-token', ctx);

      expect(security.touchSession).toHaveBeenCalledWith('user-id-1', ctx);
      expect(security.record).not.toHaveBeenCalled();
    });

    it('logout: chiude la sessione', async () => {
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);
      await service.logout('user-id-1');
      expect(security.endSession).toHaveBeenCalledWith('user-id-1');
    });
  });

  // ── refreshAccessToken ──────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('should issue a new token pair when refresh token is valid', async () => {
      const rawRefresh = 'raw-refresh-token';
      const hash = await bcrypt.hash(sha256(rawRefresh), 10);
      const user = makeUser({ refreshTokenHash: hash });

      jwtService.verify.mockReturnValue({
        sub: 'user-id-1',
        email: user.email,
        role: user.role,
        type: 'refresh',
      } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      const result = await service.refreshAccessToken(rawRefresh);

      expect(result).toHaveProperty('access_token');
      expect(usersService.saveRefreshToken).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token type is not refresh', async () => {
      jwtService.verify.mockReturnValue({ sub: 'id', type: 'access' } as any);

      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('detects reuse of a rotated token even when it shares the first 72 bytes with the current one', async () => {
      // Due refresh token JWT dello stesso utente: header e inizio del payload
      // identici (> 72 byte), cambiano solo iat/exp e la firma. bcrypt sul token
      // grezzo li considerava uguali.
      const prefix = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkLTEiLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwicm9sZSI6ImFkbWluIiwidHlwZSI6InJlZnJlc2gi';
      const current = `${prefix}LCJpYXQiOjIwMDAwMDAwMDB9.firma-attuale`;
      const rotated = `${prefix}LCJpYXQiOjE5OTk5OTk5OTl9.firma-vecchia`;
      expect(prefix.length).toBeGreaterThan(72);

      const user = makeUser({ refreshTokenHash: await bcrypt.hash(sha256(current), 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await expect(service.refreshAccessToken(rotated)).rejects.toThrow('Refresh token reuse detected');
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
    });

    it('stores the SHA-256 of the new refresh token, not the raw token', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash(sha256('raw-refresh-token'), 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      const result = await service.refreshAccessToken('raw-refresh-token');

      const storedHash = usersService.saveRefreshToken.mock.calls.at(-1)![1] as string;
      expect(await bcrypt.compare(sha256(result.refresh_token as string), storedHash)).toBe(true);
    });

    it('should revoke token and throw on hash mismatch (token reuse)', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash('different-token', 10) });

      jwtService.verify.mockReturnValue({
        sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh',
      } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await expect(service.refreshAccessToken('reused-token')).rejects.toThrow(UnauthorizedException);
      // Revocation should happen on reuse detection
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke the stored refresh token', async () => {
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.logout('user-id-1');

      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
    });
  });
});
