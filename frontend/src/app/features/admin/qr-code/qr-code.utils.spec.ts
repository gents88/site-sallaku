import { describe, expect, it } from 'vitest';
import qrcode from 'qrcode-generator';
import {
  buildPayload, cleanPhone, contrastRatio, escapeVcard, escapeWifi, modulesToSvg, normalizeUrl, pngSizeFor, scanWarning,
} from './qr-code.utils';

describe('normalizeUrl', () => {
  it('aggiunge https:// solo quando manca lo schema', () => {
    expect(normalizeUrl('esempio.it/pagina')).toBe('https://esempio.it/pagina');
    expect(normalizeUrl('  http://a.it ')).toBe('http://a.it');
    expect(normalizeUrl('mailto:a@b.it')).toBe('mailto:a@b.it');
    expect(normalizeUrl('')).toBe('');
  });
});

describe('escape', () => {
  it('Wi‑Fi: protegge \\ ; , : e "', () => {
    expect(escapeWifi('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
  });
  it('vCard: protegge virgole, punti e virgola, barre e a capo', () => {
    expect(escapeVcard('Rossi, Mario; Jr\nx')).toBe('Rossi\\, Mario\\; Jr\\nx');
  });
});

describe('cleanPhone', () => {
  it('tiene cifre e + iniziale', () => {
    expect(cleanPhone(' +39 (333) 123-4567 ')).toBe('+393331234567');
    expect(cleanPhone('333 12 34')).toBe('3331234');
  });
});

describe('buildPayload', () => {
  it('link e testo', () => {
    expect(buildPayload('url', { url: 'esempio.it' })).toBe('https://esempio.it');
    expect(buildPayload('url', { url: '  ' })).toBe('');
    expect(buildPayload('text', { text: 'Ciao\nmondo ✓' })).toBe('Ciao\nmondo ✓');
  });

  it('Wi‑Fi con password, rete aperta e rete nascosta', () => {
    expect(buildPayload('wifi', { ssid: 'Casa', password: 'segreta', security: 'WPA' })).toBe('WIFI:T:WPA;S:Casa;P:segreta;;');
    expect(buildPayload('wifi', { ssid: 'Bar', security: 'nopass', password: 'ignorata' })).toBe('WIFI:T:nopass;S:Bar;;');
    expect(buildPayload('wifi', { ssid: 'X', password: 'p', security: 'WPA', hidden: 'true' })).toBe('WIFI:T:WPA;S:X;P:p;H:true;;');
    expect(buildPayload('wifi', { ssid: 'Mia;rete', password: 'a:b', security: 'WPA' })).toBe('WIFI:T:WPA;S:Mia\\;rete;P:a\\:b;;');
    expect(buildPayload('wifi', { ssid: '', password: 'x' })).toBe('');
  });

  it('contatto in formato vCard 3.0', () => {
    const out = buildPayload('contact', { firstName: 'Mario', lastName: 'Rossi', phone: '+39 333 1234567', email: 'm@r.it', org: 'Acme, Srl', website: 'acme.it' });
    expect(out.split('\n')).toEqual([
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Rossi;Mario;;;', 'FN:Mario Rossi', 'ORG:Acme\\, Srl',
      'TEL;TYPE=CELL:+393331234567', 'EMAIL:m@r.it', 'URL:https://acme.it', 'END:VCARD',
    ]);
    expect(buildPayload('contact', {})).toBe('');
  });

  it('email con oggetto e testo codificati', () => {
    expect(buildPayload('email', { to: 'a@b.it' })).toBe('mailto:a@b.it');
    expect(buildPayload('email', { to: 'a@b.it', subject: 'Ciao & grazie', body: 'Riga 1\nRiga 2' })).toBe('mailto:a@b.it?subject=Ciao%20%26%20grazie&body=Riga%201%0ARiga%202');
    expect(buildPayload('email', { subject: 'x' })).toBe('');
  });

  it('telefono e WhatsApp', () => {
    expect(buildPayload('phone', { phone: '+39 333 123' })).toBe('tel:+39333123');
    expect(buildPayload('phone', { phone: 'abc' })).toBe('');
    expect(buildPayload('whatsapp', { wa_phone: '+39 333 123 4567', wa_text: 'Ciao! come stai?' })).toBe('https://wa.me/393331234567?text=Ciao!%20come%20stai%3F');
    expect(buildPayload('whatsapp', { wa_phone: '' })).toBe('');
  });
});

describe('contrasto e avvisi', () => {
  it('nero su bianco è il massimo', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(scanWarning('#000000', '#ffffff')).toBeNull();
  });
  it('segnala poco contrasto e codice chiaro su fondo scuro', () => {
    expect(scanWarning('#777777', '#888888')).toBe('low-contrast');
    expect(scanWarning('#ffffff', '#000000')).toBe('inverted');
    expect(scanWarning('#1d4ed8', '#ffffff')).toBeNull();
  });
  it('colori non validi non producono avvisi', () => {
    expect(scanWarning('rosso', '#fff')).toBeNull();
  });
});

describe('pngSizeFor', () => {
  it('usa moduli di pixel interi, mai sopra la dimensione richiesta', () => {
    expect(pngSizeFor(25, 4, 1024)).toEqual({ module: 31, side: 31 * 33 });
    const { side } = pngSizeFor(41, 4, 512);
    expect(side).toBeLessThanOrEqual(512);
    expect(pngSizeFor(177, 4, 100)).toEqual({ module: 1, side: 185 });
  });
});

describe('modulesToSvg (con la libreria vera)', () => {
  it('ridisegna esattamente la stessa matrice dei moduli', () => {
    const qr = qrcode(0, 'M');
    qr.addData('https://gentsallaku.it/lab');
    qr.make();
    const n = qr.getModuleCount();
    const svg = modulesToSvg((r, c) => qr.isDark(r, c), n, { margin: 4, fg: '#000000', bg: '#ffffff' });
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);

    // ricostruisce la matrice dal tracciato e la confronta con quella della libreria
    const path = /<path d="([^"]*)"/.exec(svg)![1];
    const grid = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
    for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, len] = [Number(m[1]) - 4, Number(m[2]) - 4, Number(m[3])];
      for (let i = 0; i < len; i++) grid[y][x + i] = true;
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) expect(grid[r][c], `modulo ${r},${c}`).toBe(qr.isDark(r, c));
  });

  it('inserisce il titolo con i caratteri speciali protetti', () => {
    const svg = modulesToSvg(() => false, 21, { margin: 4, fg: '#000', bg: '#fff', title: 'A & B <c>' });
    expect(svg).toContain('<title>A &amp; B &lt;c&gt;</title>');
  });
});
