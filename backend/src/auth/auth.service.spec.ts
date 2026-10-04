import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';

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

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let otpService: jest.Mocked<OtpService>;

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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    otpService = module.get(OtpService);
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
  });

  // ── refreshAccessToken ──────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('should issue a new token pair when refresh token is valid', async () => {
      const rawRefresh = 'raw-refresh-token';
      const hash = await bcrypt.hash(rawRefresh, 10);
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
