/**
 * Normalizza il link a un profilo LinkedIn personale e lo accetta solo in questa forma:
 *   https://www.linkedin.com/in/<slug>
 *
 * Accetta con o senza protocollo e "www.", sottodomini nazionali (it.linkedin.com),
 * barra finale, query string e parti extra dopo lo slug (/in/mario-rossi/details/…).
 * Rifiuta qualsiasi altro host (anche "linkedin.com.evil.example"), pagine aziendali
 * (/company/…), link di condivisione e slug fuori misura: il link finisce su una
 * pagina pubblica, non deve poter puntare altrove.
 *
 * @returns l'URL normalizzato, oppure null se non è un profilo LinkedIn valido.
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
  // Gli slug LinkedIn sono lettere, numeri e trattini; i caratteri accentati
  // arrivano percent-encoded e vengono ricodificati qui.
  if (slug.length < 3 || slug.length > 100 || !/^[\p{L}\p{N}_-]+$/u.test(slug)) return null;

  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`;
}
