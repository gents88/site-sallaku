import { AbstractControl, ValidationErrors } from '@angular/forms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Porta un numero scritto a mano nel formato E.164 che il backend accetta:
 * "333 123 4567", "0039 333-1234567", "(+39) 333.1234567" → "+393331234567".
 * Senza prefisso internazionale il numero si considera italiano. Null se
 * anche dopo la pulizia non è un numero valido.
 */
export function normalizePhone(raw: string): string | null {
  let v = (raw ?? '').trim().replace(/[\s().\-/]/g, '');
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  // I numeri nazionali italiani arrivano al massimo a 11 cifre: 12 o più che
  // iniziano con 39 hanno già il prefisso, scritto senza "+".
  else if (!v.startsWith('+')) v = /^39\d{10,}$/.test(v) ? `+${v}` : `+39${v}`;
  return E164_RE.test(v) ? v : null;
}

/** Email da usare per l'invio del codice, o numero già normalizzato in E.164. */
export function normalizeIdentifier(raw: string): string {
  const v = (raw ?? '').trim();
  return v.includes('@') ? v : normalizePhone(v) ?? v;
}

export function emailValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return { required: true };
  return EMAIL_RE.test(v) ? null : { email: true };
}

export function phoneValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return { required: true };
  return normalizePhone(v) ? null : { phone: true };
}

/** Validates that the value is either a valid phone (see normalizePhone) OR a valid email. */
export function phoneOrEmailValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return { required: true };
  const isEmail = EMAIL_RE.test(v);
  const isPhone = !v.includes('@') && normalizePhone(v) !== null;
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
  if (msg.includes('sms delivery is not available')) return { key: 'auth.err_sms_unavailable' };
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
