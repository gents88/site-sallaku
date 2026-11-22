/**
 * Logica pura del generatore di QR code: costruzione del testo codificato per ogni tipo
 * (link, Wi‑Fi, contatto, email…), disegno SVG dei moduli, controllo del contrasto e calcolo
 * delle dimensioni dell'immagine PNG. Niente DOM: si testa senza browser.
 */

export type QrType = 'url' | 'text' | 'wifi' | 'contact' | 'email' | 'phone' | 'whatsapp';
export const QR_TYPES: readonly QrType[] = ['url', 'text', 'wifi', 'contact', 'email', 'phone', 'whatsapp'];

export type QrFields = Readonly<Record<string, string>>;
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

/** Aggiunge https:// a un indirizzo scritto senza schema ("esempio.it" → "https://esempio.it"). */
export function normalizeUrl(input: string): string {
  const s = input.trim();
  if (!s) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

/** Nel formato WIFI: i caratteri \ ; , : " vanno preceduti da una barra rovesciata. */
export function escapeWifi(s: string): string {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

/** Nelle vCard: \ , ; e gli a capo vanno protetti. */
export function escapeVcard(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

/** Numero di telefono ripulito: cifre ed eventuale + iniziale. */
export function cleanPhone(s: string): string {
  const t = s.trim();
  const plus = t.startsWith('+') ? '+' : '';
  return plus + t.replace(/\D/g, '');
}

/**
 * Testo da codificare per il tipo scelto, o '' se mancano i dati indispensabili
 * (così l'anteprima resta vuota invece di mostrare un codice che non porta a nulla).
 */
export function buildPayload(type: QrType, f: QrFields): string {
  const v = (k: string) => (f[k] ?? '').trim();
  switch (type) {
    case 'url':
      return normalizeUrl(v('url'));
    case 'text':
      return f['text'] ?? '';
    case 'wifi': {
      if (!v('ssid')) return '';
      const sec = (v('security') || 'WPA') as WifiSecurity;
      const pass = sec === 'nopass' ? '' : `P:${escapeWifi(f['password'] ?? '')};`;
      const hidden = v('hidden') === 'true' ? 'H:true;' : '';
      return `WIFI:T:${sec};S:${escapeWifi(f['ssid'].trim())};${pass}${hidden};`;
    }
    case 'contact': {
      const first = v('firstName');
      const last = v('lastName');
      if (!first && !last && !v('phone') && !v('email')) return '';
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapeVcard(last)};${escapeVcard(first)};;;`, `FN:${escapeVcard([first, last].filter(Boolean).join(' '))}`];
      if (v('org')) lines.push(`ORG:${escapeVcard(v('org'))}`);
      if (v('phone')) lines.push(`TEL;TYPE=CELL:${cleanPhone(v('phone'))}`);
      if (v('email')) lines.push(`EMAIL:${escapeVcard(v('email'))}`);
      if (v('website')) lines.push(`URL:${normalizeUrl(v('website'))}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'email': {
      const to = v('to');
      if (!to) return '';
      const q: string[] = [];
      if (v('subject')) q.push(`subject=${encodeURIComponent(v('subject'))}`);
      if (f['body']?.trim()) q.push(`body=${encodeURIComponent(f['body'].trim())}`);
      return `mailto:${to}${q.length ? `?${q.join('&')}` : ''}`;
    }
    case 'phone': {
      const p = cleanPhone(v('phone'));
      return p.replace('+', '') ? `tel:${p}` : '';
    }
    case 'whatsapp': {
      const digits = v('wa_phone').replace(/\D/g, '');
      if (!digits) return '';
      return `https://wa.me/${digits}${v('wa_text') ? `?text=${encodeURIComponent(v('wa_text'))}` : ''}`;
    }
  }
}

// ── Colori e leggibilità ────────────────────────────────────────

export function isValidHex(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  if (!isValidHex(a) || !isValidHex(b)) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ScanWarning = 'low-contrast' | 'inverted' | null;

/**
 * Avvisa dei colori che mettono a rischio la lettura: poco contrasto (sotto 4:1) oppure
 * codice chiaro su sfondo scuro, che molti lettori non riconoscono.
 */
export function scanWarning(fg: string, bg: string): ScanWarning {
  if (!isValidHex(fg) || !isValidHex(bg)) return null;
  if (contrastRatio(fg, bg) < 4) return 'low-contrast';
  return luminance(fg) > luminance(bg) ? 'inverted' : null;
}

// ── Disegno ─────────────────────────────────────────────────────

export interface SvgOptions {
  margin: number;
  fg: string;
  bg: string;
  /** Testo alternativo per chi usa uno screen reader */
  title?: string;
}

const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * SVG a un solo tracciato: i moduli scuri adiacenti di una riga si fondono in un rettangolo,
 * il file resta piccolo e nitido a qualsiasi ingrandimento (stampa inclusa).
 */
export function modulesToSvg(isDark: (row: number, col: number) => boolean, count: number, o: SvgOptions): string {
  const size = count + o.margin * 2;
  let d = '';
  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (!isDark(r, c)) { c++; continue; }
      let end = c;
      while (end < count && isDark(r, end)) end++;
      d += `M${c + o.margin} ${r + o.margin}h${end - c}v1h-${end - c}z`;
      c = end;
    }
  }
  const title = o.title ? `<title>${escapeXml(o.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges" role="img">${title}<rect width="${size}" height="${size}" fill="${o.bg}"/><path d="${d}" fill="${o.fg}"/></svg>`;
}

/**
 * Dimensioni dell'immagine PNG: ogni modulo è un numero INTERO di pixel (un modulo di 2,7 px
 * verrebbe sfocato e il codice diventerebbe meno leggibile), quindi il lato reale è il multiplo
 * più vicino per difetto a quello richiesto.
 */
export function pngSizeFor(count: number, margin: number, targetPx: number): { module: number; side: number } {
  const total = count + margin * 2;
  const module = Math.max(1, Math.floor(targetPx / total));
  return { module, side: module * total };
}
