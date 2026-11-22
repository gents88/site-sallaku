import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService, MAX_FAILED_LOGINS, REFRESH_REUSE_GRACE_MS } from './auth.service';
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
  let security: { record: jest.Mock; createSession: jest.Mock; findRefreshSession: jest.Mock; rotateSession: jest.Mock; endSession: jest.Mock; endAllSessions: jest.Mock };
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
            createSession: jest.fn().mockResolvedValue(undefined),
            findRefreshSession: jest.fn().mockResolvedValue(null),
            rotateSession: jest.fn().mockResolvedValue(true),
            endSession: jest.fn().mockResolvedValue(undefined),
            endAllSessions: jest.fn().mockResolvedValue(undefined),
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

    describe('email già registrata (nessuna enumerazione degli account)', () => {
      const dto = { name: 'X', email: 'test@example.com', password: 'StrongPass123!' };
      let hash: jest.SpyInstance;

      beforeEach(() => {
        // Il costo reale di bcrypt (12 round) non serve: conta che venga fatto, come per un account nuovo.
        hash = jest.spyOn(bcrypt, 'hash').mockResolvedValue('hash' as never);
        otpService.requestOtp.mockResolvedValue({ message: 'OTP sent' });
      });
      afterEach(() => hash.mockRestore());

      it('risponde esattamente come per una registrazione nuova', async () => {
        usersService.findByEmail.mockResolvedValue(null);
        usersService.create.mockResolvedValue(makeUser({ emailVerified: false }) as any);
        const fresh = await service.register(dto);

        usersService.findByEmail.mockResolvedValue(makeUser() as any);
        const existing = await service.register(dto);

        expect(existing).toEqual(fresh);
      });

      it('non crea un secondo account e non lo modifica', async () => {
        usersService.findByEmail.mockResolvedValue(makeUser() as any);

        await service.register(dto);

        expect(usersService.create).not.toHaveBeenCalled();
        expect(usersService.deleteById).not.toHaveBeenCalled();
      });

      it('manda comunque il codice: il titolare dell\'indirizzo può entrare, chi ha provato non impara nulla', async () => {
        usersService.findByEmail.mockResolvedValue(makeUser() as any);

        await service.register(dto);

        expect(otpService.requestOtp).toHaveBeenCalledWith(undefined, 'test@example.com');
      });

      it('fa lo stesso hash della registrazione nuova, così il tempo di risposta non rivela l\'esistenza', async () => {
        usersService.findByEmail.mockResolvedValue(makeUser() as any);

        await service.register(dto);

        expect(hash).toHaveBeenCalledWith(dto.password, 12);
      });

      it('gli errori di invio sono quelli di una registrazione nuova (es. limite di richieste)', async () => {
        usersService.findByEmail.mockResolvedValue(makeUser() as any);
        otpService.requestOtp.mockRejectedValue(new BadRequestException('Too many OTP requests.'));

        await expect(service.register(dto)).rejects.toThrow(BadRequestException);
        expect(usersService.deleteById).not.toHaveBeenCalled();
      });

      it('non risponde mai 409 "Email already registered"', async () => {
        usersService.findByEmail.mockResolvedValue(makeUser() as any);

        await expect(service.register(dto)).resolves.toBeDefined();
      });
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
        // Il confronto finto usa un hash a 12 round: 10 giri reali superano il timeout sui runner lenti.
        // Qui interessa il conteggio, non il costo di bcrypt.
        const compare = jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
        try {
          for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
            await expect(service.login({ email: 'ghost@example.com', password: 'x' })).rejects.toThrow(UnauthorizedException);
          }
          // Anche per un'email inesistente si fa il confronto: il tempo di risposta non rivela se l'account esiste.
          expect(compare).toHaveBeenCalledTimes(MAX_FAILED_LOGINS);
          await expect(service.login({ email: 'ghost@example.com', password: 'x' })).rejects.toMatchObject({ status: 429 });
        } finally {
          compare.mockRestore();
        }
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
    it('login riuscito: registra l’evento e crea la sessione con IP e dispositivo', async () => {
      const hash = await bcrypt.hash('MyPassword1!', 10);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }) as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.login({ email: 'test@example.com', password: 'MyPassword1!' }, ctx);

      expect(security.record).toHaveBeenCalledWith('login_success', ctx, expect.objectContaining({ userId: 'user-id-1' }));
      expect(security.createSession).toHaveBeenCalledWith('user-id-1', expect.any(String), expect.any(String), ctx);
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

      expect(security.createSession).not.toHaveBeenCalled();
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
      expect(security.createSession).not.toHaveBeenCalled();
    });

    it('un errore OTP che non è un rifiuto (es. database giù) non finisce tra i tentativi falliti', async () => {
      otpService.verifyOtp.mockRejectedValue(new Error('db down'));
      await expect(service.verifyOtp(undefined, 'a@example.com', '1', ctx)).rejects.toThrow('db down');
      expect(security.record).not.toHaveBeenCalled();
    });

    it('OTP corretto: registra l’accesso e crea la sessione', async () => {
      otpService.verifyOtp.mockResolvedValue(makeUser() as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.verifyOtp(undefined, 'test@example.com', '123456', ctx);

      expect(security.record).toHaveBeenCalledWith('login_success', ctx, expect.objectContaining({ detail: 'codice OTP' }));
      expect(security.createSession).toHaveBeenCalledWith('user-id-1', expect.any(String), expect.any(String), ctx);
    });

    it('riuso di un refresh token (emesso prima del multi-dispositivo): registra l’evento e revoca il vecchio token', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash('un-altro', 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await expect(service.refreshAccessToken('riusato', ctx)).rejects.toThrow('reuse detected');

      expect(security.record).toHaveBeenCalledWith('refresh_reuse', ctx, expect.objectContaining({ userId: 'user-id-1' }));
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
    });

    it('rinnovo valido di un token precedente al multi-dispositivo: passa al nuovo schema senza registrare eventi', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash(sha256('raw-refresh-token'), 10) });
      jwtService.verify.mockReturnValue({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh' } as any);
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      await service.refreshAccessToken('raw-refresh-token', ctx);

      expect(security.createSession).toHaveBeenCalledWith('user-id-1', expect.any(String), expect.any(String), ctx);
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
      expect(security.record).not.toHaveBeenCalled();
    });

    it('logout di un token precedente al multi-dispositivo: revoca il vecchio refresh token', async () => {
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);
      await service.logout('user-id-1');
      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
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

      const storedHash = security.createSession.mock.calls.at(-1)![2] as string;
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

  // ── più dispositivi in contemporanea ────────────────────────────────────────

  describe('sessioni per dispositivo', () => {
    const SID = 'sid-telefono';
    const refreshPayload = (user: ReturnType<typeof makeUser>, sid: string | null = SID) =>
      ({ sub: 'user-id-1', email: user.email, role: user.role, type: 'refresh', ...(sid ? { sid } : {}) }) as any;

    async function sessionWith(current: string, extra: Record<string, unknown> = {}) {
      return { refreshTokenHash: await bcrypt.hash(sha256(current), 4), ...extra };
    }

    it('due accessi su dispositivi diversi creano due sessioni e non ne chiudono nessuna', async () => {
      const hash = await bcrypt.hash('MyPassword1!', 4);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }) as any);

      await service.login({ email: 'test@example.com', password: 'MyPassword1!' }, { ip: '1.1.1.1', userAgent: 'telefono' });
      await service.login({ email: 'test@example.com', password: 'MyPassword1!' }, { ip: '2.2.2.2', userAgent: 'computer' });

      expect(security.createSession).toHaveBeenCalledTimes(2);
      const [first, second] = security.createSession.mock.calls.map((c) => c[1]);
      expect(first).not.toBe(second);
      expect(security.endSession).not.toHaveBeenCalled();
      expect(security.endAllSessions).not.toHaveBeenCalled();
    });

    it('access e refresh token portano il sid della sessione appena creata', async () => {
      const hash = await bcrypt.hash('MyPassword1!', 4);
      usersService.findByEmail.mockResolvedValue(makeUser({ passwordHash: hash }) as any);

      await service.login({ email: 'test@example.com', password: 'MyPassword1!' }, ctx);

      const sid = security.createSession.mock.calls[0][1];
      const signed = jwtService.sign.mock.calls.map((c) => c[0] as { sid?: string; type?: string });
      expect(signed).toHaveLength(2);
      expect(signed.every((p) => p.sid === sid)).toBe(true);
      expect(signed.map((p) => p.type)).toEqual([undefined, 'refresh']);
    });

    it('il rinnovo ruota solo la sessione indicata dal sid: stesso sid, hash nuovo, nessuna sessione creata', async () => {
      const user = makeUser();
      jwtService.verify.mockReturnValue(refreshPayload(user));
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      const session = await sessionWith('refresh-attuale');
      security.findRefreshSession.mockResolvedValue(session);

      const result = await service.refreshAccessToken('refresh-attuale', ctx);

      expect(security.findRefreshSession).toHaveBeenCalledWith('user-id-1', SID);
      expect(security.rotateSession).toHaveBeenCalledWith('user-id-1', SID, session.refreshTokenHash, expect.any(String), ctx);
      expect(security.createSession).not.toHaveBeenCalled();
      expect(usersService.saveRefreshToken).not.toHaveBeenCalled();
      const newHash = security.rotateSession.mock.calls[0][3] as string;
      expect(await bcrypt.compare(sha256(result.refresh_token as string), newHash)).toBe(true);
      expect(jwtService.sign.mock.calls.every((c) => (c[0] as { sid?: string }).sid === SID)).toBe(true);
    });

    it('una sessione che non esiste più (logout o revoca) respinge il rinnovo', async () => {
      const user = makeUser();
      jwtService.verify.mockReturnValue(refreshPayload(user));
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      security.findRefreshSession.mockResolvedValue(null);

      await expect(service.refreshAccessToken('qualsiasi')).rejects.toThrow('revoked');
      expect(security.rotateSession).not.toHaveBeenCalled();
    });

    it('il riuso di un token già ruotato chiude SOLO quel dispositivo e lascia gli altri', async () => {
      const user = makeUser();
      jwtService.verify.mockReturnValue(refreshPayload(user));
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
      security.findRefreshSession.mockResolvedValue(await sessionWith('refresh-attuale'));

      await expect(service.refreshAccessToken('refresh-rubato', ctx)).rejects.toThrow('reuse detected');

      expect(security.endSession).toHaveBeenCalledWith('user-id-1', SID);
      expect(security.endAllSessions).not.toHaveBeenCalled();
      expect(security.record).toHaveBeenCalledWith('refresh_reuse', ctx, expect.objectContaining({ userId: 'user-id-1' }));
      expect(security.rotateSession).not.toHaveBeenCalled();
    });

    describe('tolleranza dopo la rotazione (due schede che rinnovano insieme)', () => {
      it('il token appena ruotato è ancora accettato entro la finestra e non è un riuso', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-nuovo', {
            retiredRefreshHashes: [{ hash: await bcrypt.hash(sha256('refresh-appena-ruotato'), 4), retiredAt: new Date(Date.now() - 3_000) }],
          }),
        );

        const result = await service.refreshAccessToken('refresh-appena-ruotato', ctx);

        expect(result).toHaveProperty('access_token');
        expect(security.endSession).not.toHaveBeenCalled();
        expect(security.record).not.toHaveBeenCalled();
      });

      it('chi arriva dopo la rotazione riceve SOLO un access token: il refresh token non cambia e nessuna sessione viene ruotata', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-nuovo', {
            retiredRefreshHashes: [{ hash: await bcrypt.hash(sha256('refresh-appena-ruotato'), 4), retiredAt: new Date(Date.now() - 1_000) }],
          }),
        );

        const result = await service.refreshAccessToken('refresh-appena-ruotato', ctx);

        expect(result.refresh_token).toBeUndefined();
        expect(security.rotateSession).not.toHaveBeenCalled();
        expect(jwtService.sign).toHaveBeenCalledTimes(1);
        expect(jwtService.sign.mock.calls[0][0]).toEqual(expect.objectContaining({ sub: 'user-id-1', sid: SID }));
        expect(jwtService.sign.mock.calls[0][0]).not.toHaveProperty('type');
      });

      it('fuori dalla finestra lo stesso token è un riuso e chiude la sessione', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-nuovo', {
            retiredRefreshHashes: [{ hash: await bcrypt.hash(sha256('refresh-vecchio'), 4), retiredAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 5_000) }],
          }),
        );

        await expect(service.refreshAccessToken('refresh-vecchio', ctx)).rejects.toThrow('reuse detected');
        expect(security.endSession).toHaveBeenCalledWith('user-id-1', SID);
      });

      it('un token ritirato da poco resta valido anche dopo altre rotazioni (tre rinnovi insieme)', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        // Il primo token è stato ritirato per primo; poi la sessione ha ruotato altre due volte.
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-terzo', {
            retiredRefreshHashes: [
              { hash: await bcrypt.hash(sha256('refresh-primo'), 4), retiredAt: new Date(Date.now() - 2_000) },
              { hash: await bcrypt.hash(sha256('refresh-secondo'), 4), retiredAt: new Date(Date.now() - 1_000) },
            ],
          }),
        );

        await expect(service.refreshAccessToken('refresh-primo', ctx)).resolves.toHaveProperty('access_token');

        expect(security.endSession).not.toHaveBeenCalled();
        expect(security.rotateSession).not.toHaveBeenCalled();
      });

      it('solo i token ritirati DENTRO la finestra contano: uno scaduto accanto a uno recente non passa', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-corrente', {
            retiredRefreshHashes: [
              { hash: await bcrypt.hash(sha256('refresh-scaduto'), 4), retiredAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000) },
              { hash: await bcrypt.hash(sha256('refresh-recente'), 4), retiredAt: new Date(Date.now() - 1_000) },
            ],
          }),
        );

        await expect(service.refreshAccessToken('refresh-scaduto', ctx)).rejects.toThrow('reuse detected');
      });

      it('un token mai visto non passa nemmeno entro la finestra', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(
          await sessionWith('refresh-nuovo', {
            retiredRefreshHashes: [{ hash: await bcrypt.hash(sha256('refresh-precedente'), 4), retiredAt: new Date() }],
          }),
        );

        await expect(service.refreshAccessToken('estraneo', ctx)).rejects.toThrow('reuse detected');
      });
    });

    describe('rinnovi simultanei sulla stessa sessione', () => {
      it('se un\'altra richiesta ruota per prima, si rilegge: il token ora risulta ritirato e basta un nuovo access token', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        const before = await sessionWith('refresh-attuale');
        const after = await sessionWith('refresh-ruotato-da-altri', {
          retiredRefreshHashes: [{ hash: before.refreshTokenHash, retiredAt: new Date() }],
        });
        security.findRefreshSession.mockResolvedValueOnce(before).mockResolvedValueOnce(after);
        security.rotateSession.mockResolvedValueOnce(false);

        const result = await service.refreshAccessToken('refresh-attuale', ctx);

        expect(result).toHaveProperty('access_token');
        expect(result.refresh_token).toBeUndefined();
        expect(security.findRefreshSession).toHaveBeenCalledTimes(2);
        expect(security.rotateSession).toHaveBeenCalledTimes(1);
        expect(security.endSession).not.toHaveBeenCalled();
      });

      it('con molte richieste insieme ruota una sola sessione: le altre ricevono solo l\'access token, nessuna 401', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        const before = await sessionWith('refresh-attuale');
        const after = await sessionWith('refresh-del-vincitore', {
          retiredRefreshHashes: [{ hash: before.refreshTokenHash, retiredAt: new Date() }],
        });
        // La prima richiesta vince la rotazione; le altre trovano già la sessione ruotata.
        security.findRefreshSession.mockResolvedValueOnce(before).mockResolvedValue(after);
        security.rotateSession.mockResolvedValueOnce(true);

        const results = await Promise.all(Array.from({ length: 6 }, () => service.refreshAccessToken('refresh-attuale', ctx)));

        expect(results.filter((r) => r.refresh_token)).toHaveLength(1);
        expect(results.filter((r) => !r.refresh_token)).toHaveLength(5);
        expect(security.rotateSession).toHaveBeenCalledTimes(1);
        expect(security.endSession).not.toHaveBeenCalled();
      });

      it('se la rotazione perde la gara ma il token resta quello corrente, dopo tre tentativi rifiuta senza chiudere la sessione', async () => {
        const user = makeUser();
        jwtService.verify.mockReturnValue(refreshPayload(user));
        usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);
        security.findRefreshSession.mockResolvedValue(await sessionWith('refresh-attuale'));
        security.rotateSession.mockResolvedValue(false);

        await expect(service.refreshAccessToken('refresh-attuale', ctx)).rejects.toThrow(UnauthorizedException);

        expect(security.rotateSession).toHaveBeenCalledTimes(3);
        expect(security.endSession).not.toHaveBeenCalled();
      });
    });

    it('il logout chiude solo il dispositivo indicato dal sid e non tocca il vecchio refresh token', async () => {
      await service.logout('user-id-1', SID);

      expect(security.endSession).toHaveBeenCalledWith('user-id-1', SID);
      expect(security.endAllSessions).not.toHaveBeenCalled();
      expect(usersService.saveRefreshToken).not.toHaveBeenCalled();
    });

    it('un refresh token valido senza sid (emesso prima del rilascio) migra: vecchio hash azzerato, nuova sessione', async () => {
      const user = makeUser({ refreshTokenHash: await bcrypt.hash(sha256('token-vecchio-schema'), 4) });
      jwtService.verify.mockReturnValue(refreshPayload(user, null));
      usersService.findByIdWithRefreshToken.mockResolvedValue(user as any);

      const result = await service.refreshAccessToken('token-vecchio-schema', ctx);

      expect(usersService.saveRefreshToken).toHaveBeenCalledWith('user-id-1', null);
      expect(security.createSession).toHaveBeenCalledTimes(1);
      expect(security.findRefreshSession).not.toHaveBeenCalled();
      const sid = security.createSession.mock.calls[0][1];
      expect(sid).toEqual(expect.any(String));
      expect(jwtService.sign.mock.calls.every((c) => (c[0] as { sid?: string }).sid === sid)).toBe(true);
      expect(result).toHaveProperty('refresh_token');
    });

    it('un utente che non esiste più non può rinnovare', async () => {
      jwtService.verify.mockReturnValue(refreshPayload(makeUser()));
      usersService.findByIdWithRefreshToken.mockResolvedValue(null);

      await expect(service.refreshAccessToken('x')).rejects.toThrow('revoked');
    });
  });
});
