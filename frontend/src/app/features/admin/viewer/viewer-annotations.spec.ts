import { describe, expect, it } from 'vitest';
import { toNormRect, quoteFromRect, annotationsToMarkdown, NormRect } from './viewer-annotations';
import type { LibraryAnnotation } from '../../../core/services/library.service';

/** Item di testo come lo restituisce pdf.js: transform = [a, b, c, d, e, f], con e/f la posizione. */
function textItem(str: string, x: number, y: number, width: number, height = 10) {
  return { str, width, transform: [height, 0, 0, height, x, y] };
}

/**
 * Pagina finta con un viewport 100x100 dove le coordinate PDF coincidono con
 * quelle del viewport tranne l'asse y, che è capovolto come nei PDF reali.
 */
function fakePage(items: ReturnType<typeof textItem>[]) {
  return {
    getViewport: () => ({
      width: 100,
      height: 100,
      convertToViewportPoint: (x: number, y: number) => [x, 100 - y],
    }),
    getTextContent: async () => ({ items }),
  } as unknown as Parameters<typeof quoteFromRect>[0];
}

describe('toNormRect', () => {
  it('normalizza un trascinamento rispetto alle dimensioni del canvas', () => {
    expect(toNormRect({ x: 100, y: 50 }, { x: 300, y: 150 }, 400, 200)).toEqual({
      x: 0.25, y: 0.25, w: 0.5, h: 0.5,
    });
  });

  it('accetta un trascinamento fatto verso l alto e verso sinistra', () => {
    expect(toNormRect({ x: 300, y: 150 }, { x: 100, y: 50 }, 400, 200)).toEqual({
      x: 0.25, y: 0.25, w: 0.5, h: 0.5,
    });
  });

  it('scarta un clic senza trascinamento', () => {
    expect(toNormRect({ x: 100, y: 50 }, { x: 102, y: 52 }, 400, 200)).toBeNull();
  });

  it('scarta un trascinamento sottile in una sola direzione', () => {
    expect(toNormRect({ x: 100, y: 50 }, { x: 300, y: 52 }, 400, 200)).toBeNull();
  });

  it('non produce mai coordinate fuori dalla pagina', () => {
    const rect = toNormRect({ x: -80, y: -40 }, { x: 600, y: 400 }, 400, 200)!;

    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1);
  });

  it('restituisce null su un canvas non ancora dimensionato', () => {
    expect(toNormRect({ x: 0, y: 0 }, { x: 50, y: 50 }, 0, 0)).toBeNull();
  });
});

describe('quoteFromRect', () => {
  const rect: NormRect = { x: 0, y: 0, w: 0.5, h: 0.5 };

  it('raccoglie solo gli item il cui centro cade nella selezione', async () => {
    // y PDF 95 -> viewport 5 (in alto); y PDF 10 -> viewport 90 (in basso).
    const page = fakePage([
      textItem('dentro', 5, 95, 20),
      textItem('fuori-basso', 5, 10, 20),
      textItem('fuori-destra', 80, 95, 15),
    ]);

    expect(await quoteFromRect(page, rect)).toBe('dentro');
  });

  it('unisce più item in un unica citazione, normalizzando gli spazi', async () => {
    const page = fakePage([
      textItem('  nel   mezzo  ', 5, 95, 20),
      textItem('del cammin', 5, 90, 20),
    ]);

    expect(await quoteFromRect(page, rect)).toBe('nel mezzo del cammin');
  });

  it('ignora gli item vuoti', async () => {
    const page = fakePage([textItem('   ', 5, 95, 20), textItem('testo', 5, 90, 20)]);

    expect(await quoteFromRect(page, rect)).toBe('testo');
  });

  it('restituisce stringa vuota su una pagina senza testo (scansione)', async () => {
    expect(await quoteFromRect(fakePage([]), rect)).toBe('');
  });
});

describe('annotationsToMarkdown', () => {
  function annotation(overrides: Partial<LibraryAnnotation> = {}): LibraryAnnotation {
    return {
      id: 'a1', docId: 'd1', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 },
      color: '#facc15', quote: 'una citazione', note: '', createdAt: 1,
      ...overrides,
    };
  }

  it('raggruppa per pagina in ordine crescente', () => {
    const md = annotationsToMarkdown('Il Libro', [
      annotation({ page: 5, quote: 'quinta' }),
      annotation({ page: 2, quote: 'seconda' }),
    ]);

    expect(md.indexOf('## Pagina 2')).toBeLessThan(md.indexOf('## Pagina 5'));
    expect(md).toContain('# Il Libro');
    expect(md).toContain('> seconda');
  });

  it('mette una sola intestazione per pagina con più annotazioni', () => {
    const md = annotationsToMarkdown('Il Libro', [
      annotation({ page: 3, quote: 'prima', rect: { x: 0, y: 0.1, w: 1, h: 0.1 } }),
      annotation({ page: 3, quote: 'seconda', rect: { x: 0, y: 0.6, w: 1, h: 0.1 } }),
    ]);

    expect(md.match(/## Pagina 3/g)).toHaveLength(1);
  });

  it('include la nota sotto la citazione', () => {
    const md = annotationsToMarkdown('Il Libro', [annotation({ note: 'da approfondire' })]);

    expect(md).toContain('> una citazione');
    expect(md).toContain('da approfondire');
  });

  it('segnala le evidenziazioni senza testo estraibile', () => {
    const md = annotationsToMarkdown('Scansione', [annotation({ quote: '' })]);

    expect(md).toContain('_(evidenziazione senza testo estraibile)_');
  });

  it('produce solo il titolo quando non ci sono annotazioni', () => {
    expect(annotationsToMarkdown('Vuoto', []).trim()).toBe('# Vuoto');
  });
});
