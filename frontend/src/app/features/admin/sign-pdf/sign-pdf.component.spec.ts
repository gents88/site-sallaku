import { TestBed } from '@angular/core/testing';
import { importProvidersFrom, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignPdfComponent } from './sign-pdf.component';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LanguageService } from '../../../core/services/language.service';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function create(): SignPdfComponent {
  TestBed.configureTestingModule({
    providers: [
      importProvidersFrom(TranslateModule.forRoot()),
      { provide: PdfjsService, useValue: {} },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
      { provide: WorkspaceService, useValue: { peek: () => null, take: () => null, send: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: LanguageService, useValue: { current: signal('it') } },
      { provide: LabInfoService, useValue: { page: () => ({ id: 'sign-pdf', titleKey: 'a', descriptionKey: 'b', labelKey: 'c', path: '/lab/sign-pdf' }), appFields: () => ({}), faqSchemas: () => [] } },
    ],
  });
  // Si prova la logica, non il template: il componente si costruisce nel contesto di iniezione.
  return TestBed.runInInjectionContext(() => new SignPdfComponent());
}

describe('SignPdfComponent — campi sulla pagina', () => {
  let c: SignPdfComponent;
  beforeEach(() => {
    localStorage.clear();
    c = create();
    c.numPages.set(3);
  });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it('addText mette un testo sulla pagina corrente e lo seleziona', () => {
    c.addText('text');
    expect(c.fields()).toHaveLength(1);
    expect(c.fields()[0]).toMatchObject({ kind: 'text', page: 0 });
    expect(c.selectedId()).toBe(c.fields()[0].id);
    expect(c.canUndo()).toBe(true);
  });

  it('addText("date") scrive la data di oggi nel formato della lingua', () => {
    c.addText('date');
    expect(c.fields()[0].kind).toBe('date');
    expect(c.fields()[0].text).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('elimina e annulla', () => {
    c.addText('text');
    c.removeSelected();
    expect(c.fields()).toHaveLength(0);
    c.undo();
    expect(c.fields()).toHaveLength(1);
  });

  it('duplica con un id nuovo e leggermente spostato', () => {
    c.addText('text');
    const first = c.fields()[0];
    c.duplicateSelected();
    expect(c.fields()).toHaveLength(2);
    expect(c.fields()[1].id).not.toBe(first.id);
    expect(c.fields()[1].x).toBeGreaterThan(first.x - 0.0001);
  });

  it('"su tutte le pagine" copia il campo sulle altre pagine, senza raddoppiarlo se lo si ripete', () => {
    c.addText('text');
    c.applyToAllPages();
    expect(c.fields().map((f) => f.page).sort()).toEqual([0, 1, 2]);
    c.applyToAllPages();
    expect(c.fields()).toHaveLength(3);
  });

  it('onTextInput aggiorna il testo del campo selezionato', () => {
    c.addText('text');
    c.onTextInput('Mario Rossi');
    expect(c.fields()[0].text).toBe('Mario Rossi');
  });

  it('resizeSelected cambia il corpo del testo restando nei limiti', () => {
    c.addText('text');
    const fs = c.fields()[0].fs!;
    c.resizeSelected(1.15);
    expect(c.fields()[0].fs!).toBeGreaterThan(fs);
    for (let i = 0; i < 40; i++) c.resizeSelected(1.5);
    expect(c.fields()[0].fs!).toBeLessThanOrEqual(0.08);
    for (let i = 0; i < 80; i++) c.resizeSelected(1 / 1.5);
    expect(c.fields()[0].fs!).toBeGreaterThanOrEqual(0.008);
  });

  it('goTo resta tra la prima e l\'ultima pagina e toglie la selezione', () => {
    c.addText('text');
    c.goTo(99);
    expect(c.pageNum()).toBe(3);
    expect(c.selectedId()).toBeNull();
    c.goTo(-4);
    expect(c.pageNum()).toBe(1);
  });

  it('i campi di una pagina non compaiono sulle altre', () => {
    c.addText('text');
    c.goTo(2);
    expect(c.pageFields()).toHaveLength(0);
    c.goTo(1);
    expect(c.pageFields()).toHaveLength(1);
  });

  it('trascinando, il campo si sposta di una frazione della pagina e resta dentro i bordi', () => {
    c.addText('text');
    const f = c.fields()[0];
    (c as unknown as { stageRef: unknown }).stageRef = { nativeElement: { getBoundingClientRect: () => ({ width: 1000, height: 1414 }) } };
    const target = { setPointerCapture: vi.fn() };
    c.onFieldPointerDown({ stopPropagation: vi.fn(), currentTarget: target, pointerId: 1, clientX: 100, clientY: 100 } as unknown as PointerEvent, f, 'move');
    c.onFieldPointerMove({ pointerId: 1, clientX: 200, clientY: 100 } as PointerEvent);
    expect(c.fields()[0].x).toBeCloseTo(f.x + 0.1, 3);
    c.onFieldPointerMove({ pointerId: 1, clientX: 99999, clientY: 100 } as PointerEvent);
    expect(c.fields()[0].x + c.fields()[0].w).toBeLessThanOrEqual(1.0001);
    c.onFieldPointerUp({ pointerId: 1 } as PointerEvent);
  });

  it('senza firma salvata, "Firma" apre la finestra di creazione', async () => {
    await c.addSignature();
    expect(c.padOpen()).toBe(true);
    expect(c.fields()).toHaveLength(0);
  });

  it('con una firma salvata, "Firma" la mette subito sulla pagina', async () => {
    vi.useFakeTimers();
    c.savedSignature.set(PNG);
    const p = c.addSignature();
    await vi.advanceTimersByTimeAsync(2100); // jsdom non decodifica le immagini: scatta il ripiego
    await p;
    expect(c.padOpen()).toBe(false);
    expect(c.fields()[0]).toMatchObject({ kind: 'signature', image: PNG });
  });

  it('la finestra non permette di usare una firma vuota', () => {
    c.openPad();
    expect(c.canUsePad()).toBe(false);
    c.setPadTab('type');
    expect(c.canUsePad()).toBe(false);
    c.onTypedName('  ');
    expect(c.canUsePad()).toBe(false);
    c.onTypedName('Mario');
    expect(c.canUsePad()).toBe(true);
  });

  it('scaricare senza campi mostra un avviso invece di produrre un PDF identico', async () => {
    (c as unknown as { sourceBytes: Uint8Array }).sourceBytes = new Uint8Array(4);
    await c.download();
    expect(c.msg()).toContain('sign_pdf.err_no_fields');
    expect(c.exportReady()).toBe(false);
  });

  it('closeFile azzera campi, pagina e cronologia', () => {
    c.addText('text');
    c.closeFile();
    expect(c.fields()).toHaveLength(0);
    expect(c.numPages()).toBe(0);
    expect(c.canUndo()).toBe(false);
  });
});
