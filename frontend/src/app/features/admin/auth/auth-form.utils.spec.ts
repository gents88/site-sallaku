import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { mapAuthError, phoneOrEmailValidator } from './auth-form.utils';

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

  it('messaggi sconosciuti o array di validazione → chiave di fallback', () => {
    expect(mapAuthError(http(400, ['email must be an email']), 'auth.login_error').key).toBe('auth.login_error');
    expect(mapAuthError(null, 'auth.otp_send_failed').key).toBe('auth.otp_send_failed');
  });
});

describe('phoneOrEmailValidator', () => {
  const check = (v: string) => phoneOrEmailValidator(new FormControl(v));

  it('accetta email e telefono E.164', () => {
    expect(check('mario@example.com')).toBeNull();
    expect(check('  mario@example.com  ')).toBeNull();
    expect(check('+393331234567')).toBeNull();
  });

  it('rifiuta vuoto e formati non validi', () => {
    expect(check('')).toEqual({ required: true });
    expect(check('mario@')).toEqual({ phoneOrEmail: true });
    expect(check('3331234567')).toEqual({ phoneOrEmail: true });
  });
});
