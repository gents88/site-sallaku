import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Validates that the value is either a valid E.164 phone OR a valid email. */
export function phoneOrEmailValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return { required: true };
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = /^\+[1-9]\d{6,14}$/.test(v);
  return isEmail || isPhone ? null : { phoneOrEmail: true };
}

/** Errore di autenticazione già pronto per la UI: chiave i18n + eventuale azione suggerita. */
export interface AuthErrorView {
  key: string;
  params?: Record<string, unknown>;
  /** Login rifiutato per email non confermata: la card offre di inviare il codice. */
  action?: 'verify-email';
}

/**
 * Traduce un errore HTTP di /auth/* in una chiave i18n.
 * Il backend risponde con messaggi in inglese (es. "Invalid credentials"):
 * mostrarli così com'erano finiva in uno snackbar inglese anche per chi usa
 * il sito in italiano, quindi si riconoscono i casi noti e si ricade su
 * `fallbackKey` per tutto il resto.
 */
export function mapAuthError(err: unknown, fallbackKey: string): AuthErrorView {
  const e = err as { status?: number; error?: { message?: unknown } } | null;
  const status = e?.status;
  const raw = e?.error?.message;
  const msg = (Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '').toLowerCase();

  if (status === 0) return { key: 'auth.err_network' };
  // Prima di "verify your email": anche l'invio fallito dice "Please verify your email address".
  if (msg.includes('failed to send')) return { key: 'auth.otp_send_failed' };
  if (msg.includes('verify your email before')) return { key: 'auth.err_email_not_verified', action: 'verify-email' };

  const remaining = /(\d+)\s+attempts?\s+remaining/.exec(msg);
  if (remaining) return { key: 'auth.err_otp_wrong', params: { count: Number(remaining[1]) } };
  if (msg.includes('too many failed attempts')) return { key: 'auth.err_otp_locked' };
  if (status === 429) return { key: 'auth.err_too_many' };
  if (msg.includes('invalid credentials')) return { key: 'auth.login_error' };
  if (msg.includes('expired')) return { key: 'auth.otp_invalid' };
  if (status !== undefined && status >= 500) return { key: 'auth.err_server' };
  return { key: fallbackKey };
}
