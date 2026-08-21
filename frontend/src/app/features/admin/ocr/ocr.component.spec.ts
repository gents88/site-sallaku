// Installa i globali IndexedDB (indexedDB, IDBKeyRange, ...) che jsdom non fornisce.
import 'fake-indexeddb/auto';
import { PLATFORM_ID, importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { OcrComponent } from './ocr.component';
import { OcrService } from '../../../core/services/ocr.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import { LibraryService, IDB_FACTORY } from '../../../core/services/library.service';

type NewDocMeta = Parameters<LibraryService['add']>[0];

function meta(id = 'doc-a', title = 'Scansione'): NewDocMeta {
  return {
    id, title, author: '', year: '', source: 'internet_archive',
    sourceLabel: 'Internet Archive', detailsUrl: '', coverUrl: null,
  };
}

const pdf = (size = 64) => new Blob([new Uint8Array(size)], { type: 'application/pdf' });

/** Pagina pdf.js senza text layer: getTextContent vuoto forza il path OCR (rasterizza + riconosce). */
function scannedPage() {
  return {
    getViewport: () => ({ width: 100, height: 100 }),
    getTextContent: async () => ({ items: [] }),
  };
}

describe('OcrComponent — collegamento con la Libreria', () => {
  let library: LibraryService;
  let workspace: WorkspaceService;
  let pdfjs: { openDocument: ReturnType<typeof vi.fn>; renderPageToBlob: ReturnType<typeof vi.fn> };
  let ocrSvc: { extract: ReturnType<typeof vi.fn> };

  function configure(): void {
    pdfjs = {
      openDocument: vi.fn().mockResolvedValue({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue(scannedPage()),
        loadingTask: { destroy: vi.fn() },
      }),
      renderPageToBlob: vi.fn().mockResolvedValue(new Blob([new Uint8Array(4)], { type: 'image/png' })),
    };
    ocrSvc = {
      extract: vi.fn().mockReturnValue(
        of({
          lang: 'ita',
          text: 'pagina uno\n\npagina due',
          pages: [
            { index: 0, text: 'testo riconosciuto pagina uno', confidence: 91 },
            { index: 1, text: 'testo riconosciuto pagina due', confidence: 88 },
          ],
        }),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: IDB_FACTORY, useValue: new IDBFactory() },
        { provide: OcrService, useValue: ocrSvc },
        { provide: PdfjsService, useValue: pdfjs },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    library = TestBed.inject(LibraryService);
    workspace = TestBed.inject(WorkspaceService);
  }

  function create() {
    const fixture = TestBed.createComponent(OcrComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function sendFromLibrary(docId: string, blob: Blob): void {
    workspace.send({
      kind: 'file', blob, filename: 'scan.pdf', mime: 'application/pdf',
      fromTool: 'library', libraryDocId: docId,
    } satisfies Omit<WorkspaceItem, 'createdAt'>);
  }

  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  it('riscrive il testo riconosciuto come pagine indicizzate del documento sorgente', async () => {
    await library.add(meta(), pdf());
    sendFromLibrary('doc-a', pdf());
    const component = create();

    component.useWorkspaceFile();
    await component.start();
    await component.saveToLibrary();

    const pages = await library.pagesOf('doc-a');
    expect(pages).toEqual([
      { id: 'doc-a#1', docId: 'doc-a', page: 1, text: 'testo riconosciuto pagina uno' },
      { id: 'doc-a#2', docId: 'doc-a', page: 2, text: 'testo riconosciuto pagina due' },
    ]);
    expect(library.get('doc-a')?.isScanned).toBe(false);
  });

  it('non offre il salvataggio se il file non viene dalla Libreria', async () => {
    const component = create();
    const file = new File([new Uint8Array(8)], 'sciolto.pdf', { type: 'application/pdf' });
    component.files.set([file]);

    await component.start();

    expect(component.canSaveToLibrary()).toBe(false);
  });

  it('scioglie il legame se dopo il file di Libreria se ne aggiunge un altro', async () => {
    await library.add(meta(), pdf());
    sendFromLibrary('doc-a', pdf());
    const component = create();
    component.useWorkspaceFile();

    const extra = { length: 1, item: () => null, 0: new File([new Uint8Array(4)], 'extra.png', { type: 'image/png' }) } as unknown as FileList;
    component.onFilesDropped(extra);

    expect(component.libraryDocId()).toBeNull();
  });

  it('fa il merge con le pagine già indicizzate invece di sovrascriverle tutte', async () => {
    await library.add(meta(), pdf());
    // Pagina 3 già indicizzata da un giro precedente, fuori dal range che l'OCR rielabora ora.
    await library.indexPages('doc-a', [{ page: 3, text: 'testo di un giro precedente' }]);
    sendFromLibrary('doc-a', pdf());
    const component = create();

    component.useWorkspaceFile();
    await component.start();
    await component.saveToLibrary();

    const pages = await library.pagesOf('doc-a');
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages.find((p) => p.page === 3)?.text).toBe('testo di un giro precedente');
  });

  it('reset scioglie il legame con la Libreria', async () => {
    await library.add(meta(), pdf());
    sendFromLibrary('doc-a', pdf());
    const component = create();
    component.useWorkspaceFile();

    component.reset();

    expect(component.libraryDocId()).toBeNull();
    expect(component.canSaveToLibrary()).toBe(false);
  });

  it('non fa nulla se chiamato senza un documento di Libreria associato', async () => {
    const component = create();
    const file = new File([new Uint8Array(8)], 'sciolto.pdf', { type: 'application/pdf' });
    component.files.set([file]);
    await component.start();

    await component.saveToLibrary();

    expect(component.savedToLibrary()).toBe(false);
  });
});
