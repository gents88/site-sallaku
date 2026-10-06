import { TextShaper, buildOgSvg, coverHue, coverIcon, hslToHex, stripEmoji, wrapTitle } from './og-image';
import { createShaper } from './og-image.service';

/** Stub: 10px per carattere, il path riporta il testo per poterlo cercare nell'SVG. */
const stub: TextShaper = {
  width: text => text.length * 10,
  path: text => `M0 0 ${text}`,
};

describe('og-image', () => {
  it('stesso tag → stesso colore della lista, senza distinguere maiuscole', () => {
    expect(coverHue('Angular')).toBe(coverHue(' angular '));
    expect([228, 265, 192, 162, 22, 330, 44, 138]).toContain(coverHue('seo'));
  });

  it("sceglie l'icona dall'argomento, con 'article' come ripiego", () => {
    expect(coverIcon('SEO')).toBe('travel_explore');
    expect(coverIcon('Angular')).toBe('code');
    expect(coverIcon('IA')).toBe('auto_awesome');
    expect(coverIcon(undefined)).toBe('article');
  });

  it('converte hsl in esadecimale', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
    expect(hslToHex(360 + 120, 100, 25)).toBe('#008000');
  });

  it('toglie le emoji', () => {
    expect(stripEmoji('🔐 Sicurezza ⚡ nei router')).toBe('Sicurezza nei router');
  });

  it('va a capo per parole secondo la larghezza misurata', () => {
    expect(wrapTitle('uno due tre', l => l.length <= 7, 3)).toEqual(['uno due', 'tre']);
  });

  it('oltre le righe consentite chiude con "…" senza sforare la larghezza', () => {
    const fits = (l: string) => l.length <= 10;
    const lines = wrapTitle('alfa beta gamma delta epsilon zeta eta theta', fits, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines.every(fits)).toBe(true);
  });

  it('produce un SVG 1200×630 con tag, titolo e firma disegnati come path', () => {
    const svg = buildOgSvg({ title: 'Angular Signals', tag: 'Angular', slug: 'x' }, stub);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('#Angular');
    expect(svg).toContain('Angular Signals');
    expect(svg).toContain('gentsallaku.it');
    expect(svg).not.toContain('<text');
  });

  it('senza tag non disegna la pillola e usa lo slug per il colore', () => {
    const svg = buildOgSvg({ title: 'Titolo', slug: 'blinisht' }, stub);
    expect(svg).not.toContain('#Titolo');
    expect(svg).not.toContain('rx="23"');
    expect(svg).toContain(hslToHex(coverHue('blinisht'), 45, 20));
  });

  it('con il font vero il testo diventa solo path, anche con lettere accentate', () => {
    const shaper = createShaper();
    expect(shaper.width('Zadrimës', 58, true)).toBeGreaterThan(0);
    const svg = buildOgSvg({ title: 'Blinisht: identiteti i një treve të Zadrimës', tag: 'storia', slug: 'b' }, shaper);
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('Zadrimës');
    expect(svg).toMatch(/<path d="M[\d.\s-]+[LQCZ]/);
  });
});
