import { chunkText } from './text-chunking';

describe('chunkText', () => {
  it('restituisce un unico blocco se il testo entra nel limite', () => {
    expect(chunkText('testo corto', 100)).toEqual(['testo corto']);
  });

  it('restituisce array vuoto per un testo vuoto o di soli spazi', () => {
    expect(chunkText('', 100)).toEqual([]);
    expect(chunkText('   \n  ', 100)).toEqual([]);
  });

  it('non perde nessun carattere significativo, indipendentemente dal punto di taglio', () => {
    const words = Array.from({ length: 500 }, (_, i) => `parola${i}`);
    const text = words.join(' ');

    const chunks = chunkText(text, 200);
    const rebuilt = chunks.join(' ');

    for (const w of words) expect(rebuilt).toContain(w);
  });

  it('taglia preferibilmente su un paragrafo quando ce n è uno nella finestra', () => {
    const text = `${'a'.repeat(80)}\n\n${'b'.repeat(80)}`;

    const chunks = chunkText(text, 90);

    expect(chunks[0]).toBe('a'.repeat(80));
    expect(chunks[1]).toBe('b'.repeat(80));
  });

  it('ricade sulla fine di una frase quando non c è un paragrafo utile', () => {
    const text = `${'a'.repeat(60)}. ${'b'.repeat(60)}. ${'c'.repeat(60)}.`;

    const chunks = chunkText(text, 70);

    expect(chunks[0].endsWith('.')).toBe(true);
    expect(chunks.join(' ')).toContain('a'.repeat(60));
    expect(chunks.join(' ')).toContain('c'.repeat(60));
  });

  it('ricade su uno spazio quando non c è punteggiatura utile', () => {
    const text = Array.from({ length: 20 }, () => 'parola').join(' ');

    const chunks = chunkText(text, 25);

    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25);
  });

  it('taglia netto una singola parola più lunga del limite, senza andare in loop infinito', () => {
    const text = 'x'.repeat(500);

    const chunks = chunkText(text, 100);

    expect(chunks.join('')).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('nessun blocco supera mai il limite richiesto oltre un piccolo margine di trim', () => {
    const text = Array.from({ length: 50 }, (_, i) => `Frase numero ${i}. Contenuto di riempimento.`).join(' ');

    const chunks = chunkText(text, 150);

    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(151);
  });

  it('gestisce testo con molti paragrafi ricostruendo il contenuto integralmente', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragrafo ${i} con del testo di esempio ripetuto più volte.`);
    const text = paragraphs.join('\n\n');

    const chunks = chunkText(text, 300);
    const rebuilt = chunks.join(' ');

    for (const p of paragraphs) expect(rebuilt).toContain(`Paragrafo ${p.match(/\d+/)![0]}`);
  });
});
