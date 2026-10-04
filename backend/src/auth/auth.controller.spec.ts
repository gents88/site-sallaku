import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { REFRESH_COOKIE } from './refresh-cookie';

describe('AuthController refresh token transport', () => {
  const tokens = { access_token: 'acc', refresh_token: 'new-rt', expires_in: 900, user: {} };
  let service: { refreshAccessToken: jest.Mock; login: jest.Mock };
  let controller: AuthController;
  const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as never;
  const original = process.env.AUTH_REFRESH_COOKIE;

  beforeEach(() => {
    service = { refreshAccessToken: jest.fn().mockResolvedValue(tokens), login: jest.fn().mockResolvedValue(tokens) };
    controller = new AuthController(service as never);
  });
  afterEach(() => { process.env.AUTH_REFRESH_COOKIE = original; });

  it('classic mode: token from the body, refresh_token returned in JSON', async () => {
    delete process.env.AUTH_REFRESH_COOKIE;
    const out = await controller.refresh({ refreshToken: 'old' }, { headers: {} } as never, res());
    expect(service.refreshAccessToken).toHaveBeenCalledWith('old');
    expect(out).toHaveProperty('refresh_token', 'new-rt');
  });

  it('classic mode ignores a cookie: no cookie-based refresh unless explicitly enabled', async () => {
    delete process.env.AUTH_REFRESH_COOKIE;
    await expect(controller.refresh({}, { headers: { cookie: `${REFRESH_COOKIE}=x` } } as never, res()))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cookie mode: reads the httpOnly cookie and never exposes the refresh token in JSON', async () => {
    process.env.AUTH_REFRESH_COOKIE = 'true';
    const r = res() as unknown as { cookie: jest.Mock };
    const out = await controller.refresh({}, { headers: { cookie: `${REFRESH_COOKIE}=old` } } as never, r as never);
    expect(service.refreshAccessToken).toHaveBeenCalledWith('old');
    expect(out).not.toHaveProperty('refresh_token');
    expect(r.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'new-rt', expect.anything());
  });

  it('rejects a refresh with no token at all', async () => {
    process.env.AUTH_REFRESH_COOKIE = 'true';
    await expect(controller.refresh({}, { headers: {} } as never, res())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
