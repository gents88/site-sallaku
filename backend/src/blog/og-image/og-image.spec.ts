import { buildOgSvg, coverHue, coverIcon, escapeXml, hslToHex, stripEmoji, wrapTitle } from './og-image';

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

  it("toglie le emoji e fa l'escape dell'XML", () => {
    expect(stripEmoji('🔐 Sicurezza ⚡ nei router')).toBe('Sicurezza nei router');
    expect(escapeXml(`<a & "b">`)).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('va a capo per parole e tronca con "…" oltre le righe consentite', () => {
    expect(wrapTitle('uno due tre', 7, 3)).toEqual(['uno due', 'tre']);
    const lines = wrapTitle('alfa beta gamma delta epsilon zeta eta theta', 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('produce un SVG 1200×630 con titolo, tag e firma, senza testo non escapato', () => {
    const svg = buildOgSvg({ title: 'Angular & <Signals>', tag: 'Angular', slug: 'x' });
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('Angular &amp; &lt;Signals&gt;');
    expect(svg).toContain('#Angular');
    expect(svg).toContain('gentsallaku.it');
    expect(svg).not.toContain('<Signals>');
  });

  it('senza tag non disegna la pillola e usa lo slug per il colore', () => {
    const svg = buildOgSvg({ title: 'Titolo', slug: 'blinisht' });
    expect(svg).not.toContain('>#');
    expect(svg).toContain(hslToHex(coverHue('blinisht'), 45, 20));
  });
});
