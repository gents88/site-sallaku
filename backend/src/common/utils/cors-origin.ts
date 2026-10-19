const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Decide se l'header `Origin` di una richiesta cross-origin è ammesso.
 *
 * Estratta da main.ts per poterla testare. Chi la usa deve rispondere a un
 * `false` con `callback(null, false)` (nessun header CORS, il browser blocca),
 * NON con `callback(new Error(...))`: l'errore finiva nell'error handler di
 * Express e le origini non ammesse ricevevano un 500 invece di una normale
 * risposta senza CORS.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  opts: { isProduction: boolean; allowedOrigins: readonly string[] },
): boolean {
  // Richieste server-to-server / curl: nessun Origin.
  if (!origin) return true;

  // Dev/staging senza allowlist esplicita: tutto aperto.
  if (!opts.isProduction && opts.allowedOrigins.length === 0) return true;

  if (opts.allowedOrigins.includes(origin)) return true;

  // Dev: qualsiasi origine loopback (localhost / 127.0.0.1, qualsiasi porta).
  return !opts.isProduction && LOOPBACK_ORIGIN.test(origin);
}
