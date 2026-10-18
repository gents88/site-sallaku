import { FormControl } from '@angular/forms';
import { afterEach, describe, expect, it } from 'vitest';
import { LAST_LOGIN_ADMIN_KEY, mapAuthError, normalizeIdentifier, normalizePhone, phoneOrEmailValidator, phoneValidator, readLastLoginAdmin, storeLastLoginAdmin } from './auth-form.utils';

const http = (status: number, message?: unknown) => ({ status, error: { message } });

describe('mapAuthError', () => {
  it('credenziali errate → messaggio tradotto, non il testo inglese del backend', () => {
    expect(mapAuthError(http(401, 'Invalid credentials'), 'fallback')).toEqual({ key: 'auth.login_error' });
  });

  it('email non verificata → offre di inviare il codice di conferma', () => {
    const view = mapAuthError(
      http(401, 'Please verify your email before logging in. Check your inbox for the verification code.'),
      'fallback',
    );
    expect(view).toEqual({ key: 'auth.err_email_not_verified', action: 'verify-email' });
  });

  it('codice OTP sbagliato → riporta i tentativi rimasti (singolare e plurale)', () => {
    expect(mapAuthError(http(401, 'Invalid OTP code. 3 attempts remaining.'), 'f'))
      .toEqual({ key: 'auth.err_otp_wrong', params: { count: 3 } });
    expect(mapAuthError(http(401, 'Invalid OTP code. 1 attempt remaining.'), 'f'))
      .toEqual({ key: 'auth.err_otp_wrong', params: { count: 1 } });
  });

  it('troppi tentativi sul codice (401) e rate limit (429) sono messaggi distinti', () => {
    expect(mapAuthError(http(401, 'Too many failed attempts. Please request a new OTP.'), 'f').key).toBe('auth.err_otp_locked');
    expect(mapAuthError(http(429, 'ThrottlerException: Too Many Requests'), 'f').key).toBe('auth.err_too_many');
    expect(mapAuthError(http(429, 'Too many OTP requests. Please wait before requesting a new code.'), 'f').key).toBe('auth.err_too_many');
  });

  it('codice scaduto, invio fallito, rete assente, errore server', () => {
    expect(mapAuthError(http(401, 'OTP is invalid or has expired. Please request a new code.'), 'f').key).toBe('auth.otp_invalid');
    expect(mapAuthError(http(400, 'Failed to send email. Please verify your email address and try again.'), 'f').key).toBe('auth.otp_send_failed');
    expect(mapAuthError({ status: 0, error: new ProgressEvent('error') }, 'f').key).toBe('auth.err_network');
    expect(mapAuthError(http(502), 'f').key).toBe('auth.err_server');
  });

  it('SMS non disponibile (503) → invita a usare l’email, non "errore del server"', () => {
    expect(mapAuthError(http(503, 'SMS delivery is not available. Please use email.'), 'f').key).toBe('auth.err_sms_unavailable');
  });

  it('messaggi sconosciuti o array di validazione → chiave di fallback', () => {
    expect(mapAuthError(http(400, ['email must be an email']), 'auth.login_error').key).toBe('auth.login_error');
    expect(mapAuthError(null, 'auth.otp_send_failed').key).toBe('auth.otp_send_failed');
  });
});

describe('phoneOrEmailValidator', () => {
  const check = (v: string) => phoneOrEmailValidator(new FormControl(v));

  it('accetta email, telefono E.164 e numeri italiani senza prefisso', () => {
    expect(check('mario@example.com')).toBeNull();
    expect(check('  mario@example.com  ')).toBeNull();
    expect(check('+393331234567')).toBeNull();
    expect(check('333 123 4567')).toBeNull();
  });

  it('rifiuta vuoto e formati non validi', () => {
    expect(check('')).toEqual({ required: true });
    expect(check('mario@')).toEqual({ phoneOrEmail: true });
    expect(check('12ab')).toEqual({ phoneOrEmail: true });
  });
});

describe('normalizePhone', () => {
  it('senza prefisso il numero è italiano; spazi, trattini, punti e parentesi vengono tolti', () => {
    expect(normalizePhone('3331234567')).toBe('+393331234567');
    expect(normalizePhone(' 333 123 4567 ')).toBe('+393331234567');
    expect(normalizePhone('333-123.45 67')).toBe('+393331234567');
    expect(normalizePhone('06 1234 5678')).toBe('+390612345678');
  });

  it('00 vale come +, e il 39 scritto senza + non viene raddoppiato', () => {
    expect(normalizePhone('0039 333 1234567')).toBe('+393331234567');
    expect(normalizePhone('(+39) 333 1234567')).toBe('+393331234567');
    expect(normalizePhone('393331234567')).toBe('+393331234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('null per input che non diventano un numero valido', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('333abc4567')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
  });
});

describe('phoneValidator / normalizeIdentifier', () => {
  it('il validatore del cellulare usa la stessa normalizzazione', () => {
    expect(phoneValidator(new FormControl('333 123 4567'))).toBeNull();
    expect(phoneValidator(new FormControl(''))).toEqual({ required: true });
    expect(phoneValidator(new FormControl('mario@example.com'))).toEqual({ phone: true });
  });

  it('l’email resta com’è (senza spazi), il numero diventa E.164', () => {
    expect(normalizeIdentifier('  mario@example.com ')).toBe('mario@example.com');
    expect(normalizeIdentifier('333 123 4567')).toBe('+393331234567');
  });
});

describe('readLastLoginAdmin / storeLastLoginAdmin', () => {
  afterEach(() => localStorage.removeItem(LAST_LOGIN_ADMIN_KEY));

  it('di default nessun admin ricordato', () => {
    expect(readLastLoginAdmin()).toBe(false);
  });

  it('un accesso admin viene ricordato, quello di un altro profilo lo cancella', () => {
    storeLastLoginAdmin(true);
    expect(readLastLoginAdmin()).toBe(true);
    storeLastLoginAdmin(false);
    expect(readLastLoginAdmin()).toBe(false);
    expect(localStorage.getItem(LAST_LOGIN_ADMIN_KEY)).toBeNull();
  });
});
