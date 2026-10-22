/**
 * Etichetta leggibile ("Chrome su macOS") ricavata dallo user agent, per
 * riconoscere a colpo d'occhio una sessione. Euristica, non un parser
 * completo: nel dubbio restituisce "Browser sconosciuto".
 */
export function describeDevice(userAgent: string | undefined | null): string {
  const ua = (userAgent ?? '').trim();
  if (!ua) return 'Browser sconosciuto';

  // L'ordine conta: Edge/Opera/Chrome iOS contengono anche "Chrome" o "Safari".
  const browser =
    /\bEdg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /\bOPR\/|Opera/.test(ua) ? 'Opera'
    : /\bFirefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /\bCriOS\/|\bChrome\//.test(ua) ? 'Chrome'
    : /\bSafari\//.test(ua) ? 'Safari'
    : /curl\//i.test(ua) ? 'curl'
    : /node|axios|undici|python|postman/i.test(ua) ? 'Script/API client'
    : 'Browser sconosciuto';

  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux|X11/.test(ua) ? 'Linux'
    : null;

  return os ? `${browser} su ${os}` : browser;
}

/** Numeri di telefono: si tengono solo le ultime 3 cifre. Le email restano com'è (area admin, TTL 90 giorni). */
export function maskIdentifier(value: string | undefined | null): string {
  const v = (value ?? '').trim().toLowerCase().slice(0, 120);
  if (!v || v.includes('@')) return v;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 6 ? `${v.slice(0, 3)}…${digits.slice(-3)}` : v;
}
