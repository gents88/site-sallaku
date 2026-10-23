import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { REFRESH_COOKIE } from './refresh-cookie';

describe('AuthController refresh token transport', () => {
  const tokens = { access_token: 'acc', refresh_token: 'new-rt', expires_in: 900, user: {} };
  let service: { refreshAccessToken: jest.Mock; login: jest.Mock; logout: jest.Mock };
  let controller: AuthController;
  const res = () => ({ cookie: jest.fn(), clearCookie: jest.fn() }) as never;
  const original = process.env.AUTH_REFRESH_COOKIE;

  beforeEach(() => {
    service = { refreshAccessToken: jest.fn().mockResolvedValue(tokens), login: jest.fn().mockResolvedValue(tokens), logout: jest.fn().mockResolvedValue(undefined) };
    controller = new AuthController(service as never);
  });
  afterEach(() => { process.env.AUTH_REFRESH_COOKIE = original; });

  it('classic mode: token from the body, refresh_token returned in JSON', async () => {
    delete process.env.AUTH_REFRESH_COOKIE;
    const out = await controller.refresh({ refreshToken: 'old' }, { headers: {} } as never, res());
    expect(service.refreshAccessToken).toHaveBeenCalledWith('old', expect.objectContaining({ ip: expect.any(String), userAgent: expect.any(String) }));
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
    expect(service.refreshAccessToken).toHaveBeenCalledWith('old', expect.objectContaining({ ip: expect.any(String), userAgent: expect.any(String) }));
    expect(out).not.toHaveProperty('refresh_token');
    expect(r.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'new-rt', expect.anything());
  });

  it('rejects a refresh with no token at all', async () => {
    process.env.AUTH_REFRESH_COOKIE = 'true';
    await expect(controller.refresh({}, { headers: {} } as never, res())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passa IP e user agent della richiesta al servizio, per registro eventi e sessioni', async () => {
    delete process.env.AUTH_REFRESH_COOKIE;
    const req = { ip: '203.0.113.7', headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } } as never;
    await controller.login({ email: 'a@x.it', password: 'x' } as never, req, res());
    expect(service.login).toHaveBeenCalledWith({ email: 'a@x.it', password: 'x' }, { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Chrome/120' });
  });

  it('lo user agent viene troncato a 200 caratteri', async () => {
    delete process.env.AUTH_REFRESH_COOKIE;
    const req = { ip: '203.0.113.7', headers: { 'user-agent': 'x'.repeat(500) } } as never;
    await controller.login({ email: 'a@x.it', password: 'x' } as never, req, res());
    expect((service.login.mock.calls[0][1] as { userAgent: string }).userAgent).toHaveLength(200);
  });

  describe('logout: chiude solo il dispositivo che lo chiede', () => {
    const userId = { toString: () => 'user-1' };

    it('passa al servizio l’utente e il sid della sessione corrente', async () => {
      delete process.env.AUTH_REFRESH_COOKIE;
      await controller.logout({ user: { _id: userId, sid: 'sid-telefono' } }, res());
      expect(service.logout).toHaveBeenCalledWith('user-1', 'sid-telefono');
    });

    it('con un token precedente al multi-dispositivo il sid manca e il servizio usa il vecchio percorso', async () => {
      delete process.env.AUTH_REFRESH_COOKIE;
      await controller.logout({ user: { _id: userId } }, res());
      expect(service.logout).toHaveBeenCalledWith('user-1', undefined);
    });

    it('in modalità cookie cancella il cookie di questo browser', async () => {
      process.env.AUTH_REFRESH_COOKIE = 'true';
      const response = { cookie: jest.fn(), clearCookie: jest.fn() };
      await controller.logout({ user: { _id: userId, sid: 's' } }, response as never);
      expect(response.clearCookie).toHaveBeenCalled();
    });
  });
});
