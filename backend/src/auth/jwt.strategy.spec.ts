import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    usersService = { findById: jest.fn() } as unknown as jest.Mocked<UsersService>;
    strategy = new JwtStrategy(configService, usersService);
  });

  it('returns a stripped user object when the token subject still exists', async () => {
    usersService.findById.mockResolvedValue({
      _id: 'user-1',
      email: 'a@b.com',
      role: 'admin',
      name: 'Alice',
      passwordHash: 'should-not-leak',
    } as any);

    const result = await strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'admin' });

    expect(result).toEqual({ _id: 'user-1', email: 'a@b.com', role: 'admin', name: 'Alice' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('espone il sid della sessione, per il logout del solo dispositivo corrente', async () => {
    usersService.findById.mockResolvedValue({ _id: 'user-1', email: 'a@b.com', role: 'user', name: 'A' } as any);

    const result = await strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'user', sid: 'sid-telefono' });

    expect(result).toMatchObject({ sid: 'sid-telefono' });
  });

  it('un token senza sid (precedente al multi-dispositivo) resta valido, con sid assente', async () => {
    usersService.findById.mockResolvedValue({ _id: 'user-1', email: 'a@b.com', role: 'user', name: 'A' } as any);

    const result = await strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'user' });

    expect(result.sid).toBeUndefined();
  });

  it('rejects a refresh token presented as an access token, without hitting the database', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.com', role: 'admin', type: 'refresh' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('rejects tokens whose subject no longer exists (deleted/revoked user)', async () => {
    usersService.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'ghost', email: 'ghost@b.com', role: 'user' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
