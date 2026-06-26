import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<{
  _id: string; name: string; email: string; passwordHash: string;
  role: string; refreshTokenHash: string | null;
}> = {}) {
  return {
    _id: 'user-id-1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    role: 'user',
    refreshTokenHash: null,
    toString: () => 'user-id-1',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;
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
          provide: MailService,
          useValue: { sendWelcome: jest.fn() },
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
    mailService = module.get(MailService);
    otpService = module.get(OtpService);
  });

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should create a user and return token pair', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const user = makeUser();
      usersService.create.mockResolvedValue(user as any);
      usersService.saveRefreshToken.mockResolvedValue(undefined as any);

      const result = await service.register({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongPass123!',
      });

      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@example.com', role: 'user' }),
      );
      expect(mailService.sendWelcome).toHaveBeenCalledWith(user.name, user.email);
      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('expires_in', 900);
    });

    it('should throw ConflictException if email already registered', async () => {
      usersService.findByEmail.mockResolvedValue(makeUser() as any);

      await expect(
        service.register({ name: 'X', email: 'test@example.com', password: 'pass' }),
      ).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
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
