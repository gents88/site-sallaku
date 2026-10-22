import { describeDevice, maskIdentifier } from './device';

describe('describeDevice', () => {
  const cases: Array<[string, string]> = [
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Chrome su macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0', 'Edge su Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari su iOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', 'Chrome su iOS'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox su Linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 'Chrome su Android'],
    ['curl/8.4.0', 'curl'],
  ];
  it.each(cases)('%s → %s', (ua, expected) => {
    expect(describeDevice(ua)).toBe(expected);
  });

  it('senza user agent non inventa nulla', () => {
    expect(describeDevice('')).toBe('Browser sconosciuto');
    expect(describeDevice(undefined)).toBe('Browser sconosciuto');
    expect(describeDevice(null)).toBe('Browser sconosciuto');
  });
});

describe('maskIdentifier', () => {
  it('lascia le email com’è, in minuscolo', () => {
    expect(maskIdentifier(' Mario@Example.COM ')).toBe('mario@example.com');
  });

  it('di un telefono tiene l’inizio e le ultime 3 cifre', () => {
    expect(maskIdentifier('+393331234567')).toBe('+39…567');
  });

  it('taglia gli input lunghissimi e gestisce il vuoto', () => {
    expect(maskIdentifier('a'.repeat(500)).length).toBeLessThanOrEqual(120);
    expect(maskIdentifier(undefined)).toBe('');
  });
});
