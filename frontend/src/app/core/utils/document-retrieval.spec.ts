import { describe, expect, it } from 'vitest';
import {
  MAX_PASSAGE_CHARS, MAX_PASSAGES, PLAIN_TEXT_CHUNK_CHARS, hasNoText, pagesFromPlainText, rankPages, toPassages,
} from './document-retrieval';

const pages = [
  { page: 1, text: 'Introduzione generale al corso di cucina italiana.' },
  { page: 2, text: 'Gli indici del database accelerano le letture ma rallentano le scritture.' },
  { page: 3, text: 'Un indice B-tree mantiene ordinati i valori. Indice, indice, indice.' },
  { page: 4, text: '' },
];

describe('rankPages', () => {
  it('mette per prime le pagine che contengono i termini della domanda', () => {
    const ranked = rankPages('Come funziona un indice del database?', pages);
    expect(ranked.map((p) => p.page)).toEqual(expect.arrayContaining([2, 3]));
    expect(ranked.map((p) => p.page)).not.toContain(1);
  });

  it('una pagina con tutti i termini batte una che ne ripete uno solo', () => {
    const ranked = rankPages('indici database scritture', pages);
    expect(ranked[0].page).toBe(2);
  });

  it('ignora maiuscole e accenti, come la ricerca della Libreria', () => {
    const accented = [{ page: 1, text: 'La città è più grande' }];
    expect(rankPages('CITTA', accented)).toHaveLength(1);
  });

  it('non restituisce pagine vuote né senza corrispondenze', () => {
    expect(rankPages('astronomia', pages)).toEqual([]);
    expect(rankPages('?? !!', pages)).toEqual([]);
    expect(rankPages('indice', [{ page: 1, text: '   ' }])).toEqual([]);
  });

  it('rispetta il limite e, a parità di punteggio, tiene l’ordine di pagina', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ page: i + 1, text: 'indice' }));
    const ranked = rankPages('indice', many, 4);
    expect(ranked.map((p) => p.page)).toEqual([1, 2, 3, 4]);
    expect(rankPages('indice', many)).toHaveLength(MAX_PASSAGES);
  });
});

describe('toPassages', () => {
  it('taglia testo e titolo ai limiti del DTO del backend', () => {
    const out = toPassages('x'.repeat(400), [{ page: 2, text: 'y'.repeat(9000) }]);
    expect(out[0].docTitle).toHaveLength(300);
    expect(out[0].text).toHaveLength(MAX_PASSAGE_CHARS);
    expect(out[0].page).toBe(2);
    expect(MAX_PASSAGE_CHARS).toBeLessThanOrEqual(4000);
  });
});

describe('pagesFromPlainText', () => {
  it('testo vuoto: nessuna pagina', () => {
    expect(pagesFromPlainText('   \n ')).toEqual([]);
  });

  it('testo corto: una sola pagina', () => {
    expect(pagesFromPlainText('ciao mondo')).toEqual([{ page: 1, text: 'ciao mondo' }]);
  });

  it('testo lungo: blocchi numerati che non superano la dimensione e non perdono contenuto', () => {
    const paragraph = 'Parola '.repeat(60).trim() + '.';
    const text = Array.from({ length: 30 }, () => paragraph).join('\n\n');
    const out = pagesFromPlainText(text);
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((p) => p.page)).toEqual(out.map((_, i) => i + 1));
    expect(out.every((p) => p.text.length <= PLAIN_TEXT_CHUNK_CHARS)).toBe(true);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    expect(out.reduce((n, p) => n + words(p.text), 0)).toBe(words(text));
  });

  it('senza confini naturali taglia comunque alla dimensione massima', () => {
    const out = pagesFromPlainText('a'.repeat(PLAIN_TEXT_CHUNK_CHARS * 2 + 10));
    expect(out).toHaveLength(3);
  });
});

describe('hasNoText', () => {
  it('vero per una scansione (tutte le pagine vuote), falso se c’è almeno un testo', () => {
    expect(hasNoText([{ page: 1, text: '' }, { page: 2, text: '  ' }])).toBe(true);
    expect(hasNoText(pages)).toBe(false);
  });
});
