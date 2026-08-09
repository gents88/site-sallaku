import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { UsersService } from '../users/users.service';

describe('AdminBootstrapService', () => {
  let usersService: jest.Mocked<UsersService>;

  function makeService(env: Record<string, string | undefined>) {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => env[key] ?? defaultValue),
    } as unknown as ConfigService;
    usersService = { upsertAdmin: jest.fn().mockResolvedValue(undefined) } as any;
    return new AdminBootstrapService(configService, usersService);
  }

  it('skips bootstrap when ADMIN_EMAIL or ADMIN_PASSWORD is not configured', async () => {
    const service = makeService({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined });

    await service.onModuleInit();

    expect(usersService.upsertAdmin).not.toHaveBeenCalled();
  });

  it('skips bootstrap when only the password is missing', async () => {
    const service = makeService({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: undefined });

    await service.onModuleInit();

    expect(usersService.upsertAdmin).not.toHaveBeenCalled();
  });

  it('normalizes the configured email and stores a bcrypt hash, never the raw password', async () => {
    const service = makeService({
      ADMIN_EMAIL: '  Admin@Example.com  ',
      ADMIN_PASSWORD: 'super-secret',
      ADMIN_NAME: 'Root Admin',
    });

    await service.onModuleInit();

    expect(usersService.upsertAdmin).toHaveBeenCalledTimes(1);
    const arg = usersService.upsertAdmin.mock.calls[0][0];
    expect(arg.email).toBe('admin@example.com');
    expect(arg.name).toBe('Root Admin');
    expect(arg.role).toBe('admin');
    expect(arg.passwordHash).not.toBe('super-secret');
    expect(await bcrypt.compare('super-secret', arg.passwordHash!)).toBe(true);
  });

  it('falls back to the default admin name when ADMIN_NAME is not set', async () => {
    const service = makeService({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'pw' });

    await service.onModuleInit();

    expect(usersService.upsertAdmin.mock.calls[0][0].name).toBe('Gent Sallaku');
  });
});
