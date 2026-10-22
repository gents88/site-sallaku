import { describe, expect, it } from 'vitest';
import { jwtExpiresAt } from './jwt';

/** JWT di prova: la firma non conta, jwtExpiresAt legge solo il payload. */
function fakeJwt(payload: unknown): string {
  const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.firma`;
}

describe('jwtExpiresAt', () => {
  it('restituisce exp in millisecondi', () => {
    expect(jwtExpiresAt(fakeJwt({ sub: 'u1', exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it('gestisce il base64url con caratteri - e _ e senza padding', () => {
    // "???>>>" produce + e / in base64 standard, che in base64url diventano - e _
    const token = fakeJwt({ name: '???>>>~~~???', exp: 1_700_000_000 });
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(jwtExpiresAt(token)).toBe(1_700_000_000_000);
  });

  it('senza exp restituisce null', () => {
    expect(jwtExpiresAt(fakeJwt({ sub: 'u1' }))).toBeNull();
  });

  it('con exp non numerico restituisce null', () => {
    expect(jwtExpiresAt(fakeJwt({ exp: '1800000000' }))).toBeNull();
    expect(jwtExpiresAt(fakeJwt({ exp: null }))).toBeNull();
  });

  it('con un token malformato restituisce null senza lanciare', () => {
    expect(jwtExpiresAt('')).toBeNull();
    expect(jwtExpiresAt('abc')).toBeNull();
    expect(jwtExpiresAt('a.%%%.c')).toBeNull();
    expect(jwtExpiresAt('a.bm90LWpzb24.c')).toBeNull();
  });
});
