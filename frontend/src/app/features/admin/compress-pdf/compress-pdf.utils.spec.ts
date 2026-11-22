import { describe, expect, it } from 'vitest';
import {
  LEVELS, RasterPage, buildPdfFromJpegs, formatBytes, isWorthIt, looksTextBased, optimizePdf, savedPercent, scaleForDpi,
} from './compress-pdf.utils';

// JPEG 8×8 rosso
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKK8k/QD//Z';
const jpegBytes = (): Uint8Array => Uint8Array.from(atob(JPEG_B64), (c) => c.charCodeAt(0));

describe('LEVELS', () => {
  it('scendono in risoluzione e qualità dal più leggero al più forte', () => {
    expect(LEVELS.light.dpi).toBeGreaterThan(LEVELS.medium.dpi);
    expect(LEVELS.medium.dpi).toBeGreaterThan(LEVELS.strong.dpi);
    expect(LEVELS.light.quality).toBeGreaterThan(LEVELS.medium.quality);
    expect(LEVELS.medium.quality).toBeGreaterThan(LEVELS.strong.quality);
    for (const l of Object.values(LEVELS)) { expect(l.quality).toBeGreaterThan(0); expect(l.quality).toBeLessThanOrEqual(1); }
  });
});

describe('scaleForDpi', () => {
  it('72 dpi = scala 1 (un punto PDF = un pixel); 144 dpi = scala 2', () => {
    expect(scaleForDpi(72)).toBe(1);
    expect(scaleForDpi(144)).toBe(2);
  });
});

describe('formatBytes', () => {
  it('sceglie l\'unità giusta', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.50 MB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25.0 MB');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('savedPercent / isWorthIt', () => {
  it('calcola il risparmio e non va mai sotto zero', () => {
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1000)).toBe(0);
    expect(savedPercent(1000, 1400)).toBe(0);
    expect(savedPercent(0, 10)).toBe(0);
  });
  it('un risultato quasi uguale all\'originale non è "conveniente"', () => {
    expect(isWorthIt(1000, 990)).toBe(false);
    expect(isWorthIt(1000, 900)).toBe(true);
    expect(isWorthIt(1000, 1200)).toBe(false);
  });
});

describe('looksTextBased', () => {
  it('riconosce un documento di testo e una scansione', () => {
    expect(looksTextBased([900, 1200, 800])).toBe(true);
    expect(looksTextBased([0, 3, 0, 10])).toBe(false);
    expect(looksTextBased([])).toBe(false);
    expect(looksTextBased([500, 0])).toBe(true); // metà delle pagine ha testo
  });
});

describe('PDF con pdf-lib', () => {
  it('buildPdfFromJpegs crea una pagina per immagine con le misure di pagina originali', async () => {
    const pages: RasterPage[] = [
      { bytes: jpegBytes(), width: 8, height: 8, pageWidth: 595, pageHeight: 842 },
      { bytes: jpegBytes(), width: 8, height: 8, pageWidth: 842, pageHeight: 595 },
    ];
    const out = await buildPdfFromJpegs(pages);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 842, height: 595 });
    expect(new TextDecoder('latin1').decode(out)).toContain('/DCTDecode');
  });

  it('optimizePdf restituisce un PDF valido con lo stesso numero di pagine, mai più pesante di molto', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let i = 0; i < 30; i++) doc.addPage([600, 800]).drawText('Riga ' + i, { x: 50, y: 700 });
    const bloated = await doc.save({ useObjectStreams: false });
    const out = await optimizePdf(bloated);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(30);
    expect(out.length).toBeLessThanOrEqual(bloated.length);
  });
});
