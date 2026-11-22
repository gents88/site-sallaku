import { TestBed } from '@angular/core/testing';
import { importProvidersFrom, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompressPdfComponent } from './compress-pdf.component';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LanguageService } from '../../../core/services/language.service';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';

const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDn6KKK8k/QD//Z'), (c) => c.charCodeAt(0));

function fakeDoc(pages: number) {
  const page = { getViewport: () => ({ width: 600, height: 800 }), cleanup: vi.fn(), getTextContent: async () => ({ items: [] }) };
  return { numPages: pages, getPage: vi.fn(async () => page), loadingTask: { destroy: vi.fn() } };
}

function create(renderPageToJpeg: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      importProvidersFrom(TranslateModule.forRoot()),
      { provide: PdfjsService, useValue: { renderPageToJpeg } },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
      { provide: WorkspaceService, useValue: { peek: () => null, take: () => null, send: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: LanguageService, useValue: { current: signal('it') } },
      { provide: LabInfoService, useValue: { page: () => ({ id: 'compress-pdf', titleKey: 'a', descriptionKey: 'b', labelKey: 'c', path: '/lab/compress-pdf' }), appFields: () => ({}), faqSchemas: () => [] } },
    ],
  });
  return TestBed.runInInjectionContext(() => new CompressPdfComponent());
}

function load(c: CompressPdfComponent, pages: number, sourceBytes: Uint8Array) {
  const internals = c as unknown as { pdfDoc: unknown; sourceBytes: Uint8Array };
  internals.pdfDoc = fakeDoc(pages);
  internals.sourceBytes = sourceBytes;
  c.fileName.set('Relazione.pdf');
  c.fileSize.set(sourceBytes.length);
  c.numPages.set(pages);
}

describe('CompressPdfComponent', () => {
  let render: ReturnType<typeof vi.fn>;
  let c: CompressPdfComponent;
  beforeEach(() => {
    render = vi.fn().mockResolvedValue({ bytes: JPEG, width: 8, height: 8 });
    c = create(render);
  });

  it('cambiare modalità o livello azzera il risultato precedente', () => {
    load(c, 2, new Uint8Array(1000));
    c.result.set({ blob: new Blob(), name: 'x', before: 1, after: 1, percent: 0, worthIt: false, mode: 'images' });
    c.setLevel('strong');
    expect(c.result()).toBeNull();
    expect(c.level()).toBe('strong');
    c.result.set({ blob: new Blob(), name: 'x', before: 1, after: 1, percent: 0, worthIt: false, mode: 'images' });
    c.setMode('keep-text');
    expect(c.result()).toBeNull();
  });

  it('a immagini: una passata per pagina con la scala del livello scelto e un PDF più leggero di un originale pesante', async () => {
    load(c, 3, new Uint8Array(900_000)); // originale "pesante"
    c.setLevel('light');
    await c.compress();
    expect(render).toHaveBeenCalledTimes(3);
    const [, scale, quality] = render.mock.calls[0];
    expect(scale).toBeCloseTo(150 / 72);
    expect(quality).toBeCloseTo(0.82);
    expect(c.progress()).toEqual({ done: 3, total: 3 });
    const r = c.result()!;
    expect(r.name).toBe('Relazione-compresso.pdf');
    expect(r.after).toBeLessThan(r.before);
    expect(r.worthIt).toBe(true);
    expect(r.percent).toBeGreaterThan(90);
    expect(c.working()).toBe(false);
  });

  it('se il risultato non è più leggero dell\'originale lo segnala invece di spacciarlo per un successo', async () => {
    load(c, 1, new Uint8Array(200)); // originale minuscolo: il PDF ricostruito sarà più grande
    await c.compress();
    const r = c.result()!;
    expect(r.worthIt).toBe(false);
    expect(r.percent).toBe(0);
  });

  it('annullare a metà non produce nessun file e lo dice', async () => {
    load(c, 5, new Uint8Array(900_000));
    render.mockImplementation(async () => { c.cancel(); return { bytes: JPEG, width: 8, height: 8 }; });
    await c.compress();
    expect(c.result()).toBeNull();
    expect(c.msg()).toContain('compress_pdf.cancelled');
    expect(render).toHaveBeenCalledTimes(1);
    expect(c.working()).toBe(false);
  });

  it('un errore di rendering mostra un messaggio e sblocca il pulsante', async () => {
    load(c, 2, new Uint8Array(900_000));
    render.mockRejectedValue(new Error('canvas'));
    await c.compress();
    expect(c.msg()).toContain('compress_pdf.err_compress');
    expect(c.working()).toBe(false);
  });

  it('"Mantieni il testo" ottimizza senza rasterizzare', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]).drawText('Ciao', { x: 50, y: 700 });
    const bytes = await doc.save({ useObjectStreams: false });
    load(c, 1, bytes);
    c.setMode('keep-text');
    await c.compress();
    expect(render).not.toHaveBeenCalled();
    expect(c.result()?.mode).toBe('keep-text');
    expect(c.result()?.name).toBe('Relazione-compresso.pdf');
  });

  it('avvisa di un documento di testo solo se si sta per trasformarlo in immagini', () => {
    c.textBased.set(true);
    expect(c.showTextWarning()).toBe(true);
    c.setMode('keep-text');
    expect(c.showTextWarning()).toBe(false);
  });

  it('chiudere il file azzera tutto', () => {
    load(c, 2, new Uint8Array(10));
    c.closeFile();
    expect(c.numPages()).toBe(0);
    expect(c.fileName()).toBe('');
    expect(c.result()).toBeNull();
  });
});
