import { describe, expect, it, vi } from 'vitest';
import {
  PageBox, PlacedField, clampField, dataUrlToBytes, exportSignedPdf, formatToday, hexToRgb01,
  imagePlacement, normalizeRotation, textPlacement, viewToRaw, viewedSize, whiteToTransparent,
} from './sign-pdf.utils';

const BOX: PageBox = { x: 0, y: 0, width: 600, height: 800 };
// PNG 1×1 rosso
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('normalizeRotation', () => {
  it('riporta qualsiasi angolo a 0/90/180/270', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
  });
});

describe('viewedSize', () => {
  it('scambia larghezza e altezza a 90° e 270°', () => {
    expect(viewedSize(BOX, 0)).toEqual({ width: 600, height: 800 });
    expect(viewedSize(BOX, 90)).toEqual({ width: 800, height: 600 });
    expect(viewedSize(BOX, 270)).toEqual({ width: 800, height: 600 });
    expect(viewedSize(BOX, 180)).toEqual({ width: 600, height: 800 });
  });
});

describe('viewToRaw — gli angoli della vista cadono sugli angoli giusti della pagina grezza', () => {
  // Pagina grezza 600×800, origine in basso a sinistra. "Angolo alto-sinistra della vista" =
  // quello che l'utente vede in alto a sinistra dopo aver ruotato la pagina in senso orario.
  it('0°: alto-sinistra vista = alto-sinistra grezza', () => {
    expect(viewToRaw(0, 0, BOX, 0)).toEqual({ x: 0, y: 800 });
    expect(viewToRaw(600, 800, BOX, 0)).toEqual({ x: 600, y: 0 });
  });
  it('90° orario: alto-sinistra vista = basso-sinistra grezza', () => {
    expect(viewToRaw(0, 0, BOX, 90)).toEqual({ x: 0, y: 0 });
    // alto-destra vista (larghezza vista = 800) = alto-sinistra grezza
    expect(viewToRaw(800, 0, BOX, 90)).toEqual({ x: 0, y: 800 });
  });
  it('180°: alto-sinistra vista = basso-destra grezza', () => {
    expect(viewToRaw(0, 0, BOX, 180)).toEqual({ x: 600, y: 0 });
  });
  it('270° orario: alto-sinistra vista = alto-destra grezza', () => {
    expect(viewToRaw(0, 0, BOX, 270)).toEqual({ x: 600, y: 800 });
  });
  it('rispetta un box che non parte da (0,0) (CropBox)', () => {
    const cropped: PageBox = { x: 20, y: 30, width: 600, height: 800 };
    expect(viewToRaw(0, 0, cropped, 0)).toEqual({ x: 20, y: 830 });
  });
});

describe('imagePlacement', () => {
  const field = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
  it('pagina dritta: l\'origine PDF è in basso, quindi y si ribalta', () => {
    const p = imagePlacement(field, BOX, 0);
    expect(p.width).toBeCloseTo(180);
    expect(p.height).toBeCloseTo(80);
    expect(p.x).toBeCloseTo(60);
    expect(p.y).toBeCloseTo(800 - 0.3 * 800); // basso del campo = 0,3 dall'alto
    expect(p.rotate).toBe(0);
  });
  it('pagina ruotata: larghezza e altezza seguono la vista e l\'elemento ruota con la pagina', () => {
    const p = imagePlacement(field, BOX, 90);
    expect(p.width).toBeCloseTo(0.3 * 800);
    expect(p.height).toBeCloseTo(0.1 * 600);
    expect(p.rotate).toBe(90);
  });
});

describe('textPlacement', () => {
  it('usa il corpo in frazione della larghezza della pagina vista', () => {
    const p = textPlacement({ x: 0.1, y: 0.1, fs: 0.02 }, BOX, 0);
    expect(p.size).toBeCloseTo(12);
    expect(p.x).toBeCloseTo(60);
    // linea di base poco sotto il bordo alto del riquadro
    expect(p.y).toBeLessThan(800 - 0.1 * 800);
    expect(p.y).toBeGreaterThan(800 - 0.1 * 800 - 12);
  });
});

describe('clampField', () => {
  it('riporta dentro la pagina un campo uscito dai bordi', () => {
    expect(clampField({ x: -0.2, y: 0.95, w: 0.3, h: 0.1 })).toEqual({ x: 0, y: 0.9, w: 0.3, h: 0.1 });
    expect(clampField({ x: 0.9, y: 0, w: 0.3, h: 0.1 }).x).toBeCloseTo(0.7);
  });
});

describe('utilità', () => {
  it('dataUrlToBytes decodifica il base64', () => {
    const bytes = dataUrlToBytes('data:text/plain;base64,SGk=');
    expect(Array.from(bytes)).toEqual([72, 105]);
  });
  it('hexToRgb01 converte i colori e ripiega sul nero', () => {
    expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0]);
    expect(hexToRgb01('boh')).toEqual([0, 0, 0]);
  });
  it('formatToday formatta nella lingua richiesta', () => {
    const d = new Date(2026, 10, 22);
    expect(formatToday('it', d)).toBe('22/11/2026');
    expect(formatToday('en-US', d)).toBe('11/22/2026');
  });
  it('whiteToTransparent azzera l\'alpha del bianco e tiene il tratto scuro', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 10, 10, 10, 255, 230, 230, 230, 255]);
    whiteToTransparent(px);
    expect(px[3]).toBe(0); // bianco
    expect(px[7]).toBe(255); // nero
    expect(px[11]).toBeGreaterThan(0); // grigio chiaro: semitrasparente, non tagliato di netto
    expect(px[11]).toBeLessThan(255);
  });
});

async function makePdf(): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const rotated = doc.addPage([600, 800]);
  rotated.setRotation(degrees(90));
  return doc.save();
}

describe('exportSignedPdf (con pdf-lib vero)', () => {
  it('applica firma e testo senza cambiare il numero di pagine e rende il file più grande', async () => {
    const source = await makePdf();
    const fields: PlacedField[] = [
      { id: 1, page: 0, kind: 'signature', x: 0.1, y: 0.7, w: 0.3, h: 0.1, image: PNG_1PX },
      { id: 2, page: 1, kind: 'text', x: 0.1, y: 0.1, w: 0.2, h: 0.03, text: 'Mario Rossi', fs: 0.02, color: '#1d4ed8' },
      { id: 3, page: 1, kind: 'date', x: 0.5, y: 0.1, w: 0.2, h: 0.03, text: '22/11/2026', fs: 0.02 },
    ];
    const out = await exportSignedPdf(source, fields);

    const { PDFDocument } = await import('pdf-lib');
    const result = await PDFDocument.load(out);
    expect(result.getPageCount()).toBe(2);
    expect(out.length).toBeGreaterThan(source.length);
    // la firma è stata incorporata come immagine
    expect(new TextDecoder('latin1').decode(out)).toContain('/Subtype /Image');
  });

  it('un campo su una pagina inesistente o un testo vuoto vengono ignorati senza errori', async () => {
    const source = await makePdf();
    const out = await exportSignedPdf(source, [
      { id: 1, page: 9, kind: 'text', x: 0, y: 0, w: 0.1, h: 0.1, text: 'x' },
      { id: 2, page: 0, kind: 'text', x: 0, y: 0, w: 0.1, h: 0.1, text: '   ' },
    ]);
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('un testo non codificabile nel font standard passa dal rendering come immagine', async () => {
    const source = await makePdf();
    const renderTextImage = vi.fn().mockResolvedValue({ png: dataUrlToBytes(PNG_1PX), width: 100, height: 20 });
    await exportSignedPdf(source, [{ id: 1, page: 0, kind: 'text', x: 0.1, y: 0.1, w: 0.2, h: 0.03, text: 'Привет', fs: 0.02 }], { renderTextImage });
    expect(renderTextImage).toHaveBeenCalledWith('Привет', expect.any(Number), '#000000');
  });

  it('senza il renderer, un testo non codificabile viene saltato invece di rompere l\'esportazione', async () => {
    const source = await makePdf();
    await expect(exportSignedPdf(source, [{ id: 1, page: 0, kind: 'text', x: 0.1, y: 0.1, w: 0.2, h: 0.03, text: 'Привет', fs: 0.02 }])).resolves.toBeInstanceOf(Uint8Array);
  });
});
