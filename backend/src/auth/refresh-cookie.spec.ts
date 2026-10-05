import { REFRESH_COOKIE, applyRefreshCookie, clearRefreshCookie, readRefreshCookie, refreshCookieEnabled } from './refresh-cookie';

function res() {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as import('express').Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

describe('refresh cookie', () => {
  const on = { AUTH_REFRESH_COOKIE: 'true', NODE_ENV: 'production' } as NodeJS.ProcessEnv;
  const off = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

  it('is off by default (cross-site deploy would break with third-party cookies)', () => {
    expect(refreshCookieEnabled(off)).toBe(false);
    expect(refreshCookieEnabled(on)).toBe(true);
  });

  it('leaves the response untouched when disabled', () => {
    const r = res();
    const body = { access_token: 'a', refresh_token: 'r' };
    expect(applyRefreshCookie(r, body, off)).toBe(body);
    expect(r.cookie).not.toHaveBeenCalled();
  });

  it('moves the refresh token into an httpOnly, Secure, SameSite=Strict cookie scoped to /api/v1/auth', () => {
    const r = res();
    const out = applyRefreshCookie(r, { access_token: 'a', refresh_token: 'r' }, on);
    expect(out).toEqual({ access_token: 'a' });
    expect(r.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'r', expect.objectContaining({
      httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth', maxAge: 7 * 24 * 60 * 60 * 1000,
    }));
  });

  it('forces Secure when SameSite=None is configured, even outside production', () => {
    const r = res();
    applyRefreshCookie(r, { refresh_token: 'r' }, { AUTH_REFRESH_COOKIE: 'true', AUTH_COOKIE_SAMESITE: 'none', NODE_ENV: 'dev' } as NodeJS.ProcessEnv);
    expect(r.cookie.mock.calls[0][2]).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('clears the cookie with the same scope it was set with', () => {
    const r = res();
    clearRefreshCookie(r, on);
    expect(r.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/api/v1/auth', httpOnly: true }));
  });

  it('reads the cookie from the raw header without cookie-parser', () => {
    expect(readRefreshCookie({ headers: { cookie: `a=1; ${REFRESH_COOKIE}=abc.def%3D; b=2` } })).toBe('abc.def=');
    expect(readRefreshCookie({ headers: {} })).toBeUndefined();
  });
});
