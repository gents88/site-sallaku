import { StreamMarkerFilter } from './stream-markers';

function run(chunks: string[]): string {
  const f = new StreamMarkerFilter();
  return chunks.map((c) => f.push(c)).join('');
}

describe('StreamMarkerFilter', () => {
  it('lascia passare il testo normale', () => {
    expect(run(['Ciao ', 'mondo, ', 'tutto bene.'])).toBe('Ciao mondo, tutto bene.');
  });

  it('non mostra mai le righe di servizio, comunque il testo sia spezzato', () => {
    const text = 'Usa lo strumento.\nLIVE_OFFER: true\nSUGGESTIONS: a? | b? | c?';
    // spezzato in pezzi da 3 caratteri, anche in mezzo alle parole chiave
    const chunks = text.match(/[\s\S]{1,3}/g) as string[];
    const out = run(chunks);
    expect(out).not.toMatch(/LIVE|SUGGEST|true|a\?/);
    expect(out.trim()).toBe('Usa lo strumento.');
  });

  it('un testo che comincia come un marcatore ma non lo è viene mostrato', () => {
    expect(run(['SUGGESTIONE: ', 'prova'])).toBe('SUGGESTIONE: prova');
    expect(run(['Live', ' music'])).toBe('Live music');
  });

  it('trattiene la riga incompleta finché non si capisce, poi la rilascia', () => {
    const f = new StreamMarkerFilter();
    expect(f.push('Riga uno\nSUGG')).toBe('Riga uno\n');
    expect(f.push('ESTIONE vera')).toBe('SUGGESTIONE vera');
  });

  it('dopo il primo marcatore non emette più nulla', () => {
    const f = new StreamMarkerFilter();
    expect(f.push('Testo\nSUGGESTIONS: x')).toBe('Testo\n');
    expect(f.push(' | y | z\nancora testo')).toBe('');
  });
});
