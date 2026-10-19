import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Link a un profilo LinkedIn personale, accettato solo come
 * https://www.linkedin.com/in/<slug> (stessa regola del backend:
 * backend/src/common/utils/linkedin-url.ts — tenere allineati).
 * Accetta con/senza protocollo e "www.", sottodomini nazionali, barra finale,
 * query string e parti dopo lo slug. Rifiuta altri host (anche
 * "linkedin.com.evil.example"), pagine aziendali, credenziali e porte.
 *
 * @returns l'URL normalizzato, oppure null se non è un profilo valido.
 */
export function normalizeLinkedinProfileUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !/^[a-z0-9-]{2,}\.linkedin\.com$/.test(host)) return null;

  const match = /^\/in\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
  if (!match) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (slug.length < 3 || slug.length > 100 || !/^[\p{L}\p{N}_-]+$/u.test(slug)) return null;

  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}

/** Vuoto = valido (campo facoltativo); altrimenti deve essere un profilo LinkedIn. */
export function linkedinProfileValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value == null || String(value).trim() === '') return null;
  return normalizeLinkedinProfileUrl(value) ? null : { linkedin: true };
}

/** Difesa in profondità prima di mettere un link in un href: solo l'URL già normalizzato. */
export function isSafeLinkedinProfileUrl(value: unknown): value is string {
  return typeof value === 'string' && normalizeLinkedinProfileUrl(value) === value;
}
