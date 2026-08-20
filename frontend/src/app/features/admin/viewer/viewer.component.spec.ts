// Installa i globali IndexedDB (indexedDB, IDBKeyRange, ...) che jsdom non fornisce.
import 'fake-indexeddb/auto';
import { PLATFORM_ID, importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ViewerComponent } from './viewer.component';
import { LibraryService, IDB_FACTORY } from '../../../core/services/library.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SeoService } from '../../../core/services/seo.service';

type NewDocMeta = Parameters<LibraryService['add']>[0];

function meta(id = 'doc-a', title = 'Manuale'): NewDocMeta {
  return {
    id, title, author: '', year: '', source: 'internet_archive',
    sourceLabel: 'Internet Archive', detailsUrl: '', coverUrl: null,
  };
}

const pdf = (size = 64) => new Blob([new Uint8Array(size)], { type: 'application/pdf' });

/** Pagina pdf.js ridotta al minimo che il viewer tocca durante open(). */
function fakePdfPage() {
  return {
    getViewport: () => ({ width: 100, height: 100, scale: 1, convertToViewportPoint: (x: number, y: number) => [x, 100 - y] }),
    getTextContent: async () => ({ items: [] }),
    render: () => ({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

describe('ViewerComponent', () => {
  let library: LibraryService;
  let workspace: { send: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let queryParams: Record<string, string>;

  function configure(): void {
    workspace = { send: vi.fn() };
    router = { navigate: vi.fn() };
    queryParams = {};

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: IDB_FACTORY, useValue: new IDBFactory() },
        {
          provide: PdfjsService,
          useValue: {
            openDocument: vi.fn().mockResolvedValue({
              numPages: 10,
              getPage: vi.fn().mockResolvedValue(fakePdfPage()),
              loadingTask: { destroy: vi.fn() },
            }),
          },
        },
        { provide: WorkspaceService, useValue: workspace },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => queryParams[k] ?? null } } },
        },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    library = TestBed.inject(LibraryService);
  }

  function create() {
    const fixture = TestBed.createComponent(ViewerComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('condizione non raggiunta entro il timeout');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  describe('apertura dalla libreria', () => {
    it('carica il documento e le sue annotazioni dal parametro doc', async () => {
      await library.add(meta(), pdf());
      await library.addAnnotation({
        docId: 'doc-a', page: 2, rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15', quote: 'una citazione', note: '',
      });
      queryParams = { doc: 'doc-a' };

      const component = create();
      await waitFor(() => component.libraryDoc() !== null);

      expect(component.libraryDoc()?.title).toBe('Manuale');
      expect(component.annotations()).toHaveLength(1);
      expect(component.canAnnotate()).toBe(true);
    });

    it('salta alla pagina indicata nell URL', async () => {
      await library.add(meta(), pdf());
      queryParams = { doc: 'doc-a', page: '4' };

      const component = create();
      await waitFor(() => component.libraryDoc() !== null);

      expect(component.pageNum()).toBe(4);
    });

    it('segnala l errore se il documento non è più in libreria', async () => {
      queryParams = { doc: 'sparito' };

      const component = create();
      await waitFor(() => component.msg() !== '');

      expect(component.msg()).toContain('❌');
      expect(component.libraryDoc()).toBeNull();
    });

    it('senza parametro doc resta il viewer normale, senza annotazioni', async () => {
      const component = create();

      expect(component.libraryDoc()).toBeNull();
      expect(component.canAnnotate()).toBe(false);
    });
  });

  describe('archiviazione di un file aperto da disco', () => {
    it('salva in libreria il file corrente e sblocca le annotazioni', async () => {
      const component = create();
      const file = new File([new Uint8Array(16)], 'appunti.pdf', { type: 'application/pdf' });
      await component.open(file);

      await component.saveCurrentToLibrary();

      expect(component.canAnnotate()).toBe(true);
      expect(component.libraryDoc()?.title).toBe('appunti');
      expect(library.docs()).toHaveLength(1);
    });

    it('non fa nulla se non c è un file aperto', async () => {
      const component = create();

      await component.saveCurrentToLibrary();

      expect(component.libraryDoc()).toBeNull();
      expect(library.docs()).toEqual([]);
    });
  });

  describe('annotazioni', () => {
    async function withDoc() {
      await library.add(meta(), pdf());
      queryParams = { doc: 'doc-a' };
      const component = create();
      await waitFor(() => component.libraryDoc() !== null);
      return component;
    }

    it('pageAnnotations mostra solo quelle della pagina corrente', async () => {
      await library.add(meta(), pdf());
      const base = { docId: 'doc-a', color: '#facc15', quote: '', note: '' };
      await library.addAnnotation({ ...base, page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 } });
      await library.addAnnotation({ ...base, page: 3, rect: { x: 0, y: 0, w: 1, h: 0.1 } });
      queryParams = { doc: 'doc-a' };

      const component = create();
      await waitFor(() => component.annotations().length === 2);

      component.goTo(3);
      expect(component.pageAnnotations()).toHaveLength(1);
      expect(component.pageAnnotations()[0].page).toBe(3);
    });

    it('salva una nota su un evidenziazione esistente', async () => {
      const component = await withDoc();
      const saved = await library.addAnnotation({
        docId: 'doc-a', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15', quote: 'citazione', note: '',
      });
      component.annotations.set([saved]);

      component.startNote(saved);
      component.noteDraft.set('da rileggere');
      await component.saveNote(saved);

      expect(component.annotations()[0].note).toBe('da rileggere');
      expect(component.editingNoteId()).toBeNull();
      expect((await library.annotationsOf('doc-a'))[0].note).toBe('da rileggere');
    });

    it('annullare la nota non tocca l annotazione', async () => {
      const component = await withDoc();
      const saved = await library.addAnnotation({
        docId: 'doc-a', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15', quote: 'citazione', note: 'originale',
      });
      component.annotations.set([saved]);

      component.startNote(saved);
      component.noteDraft.set('scarabocchio');
      component.cancelNote();

      expect(component.annotations()[0].note).toBe('originale');
      expect(component.editingNoteId()).toBeNull();
    });

    it('elimina un annotazione dalla vista e dalla libreria', async () => {
      const component = await withDoc();
      const saved = await library.addAnnotation({
        docId: 'doc-a', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15', quote: '', note: '',
      });
      component.annotations.set([saved]);

      await component.deleteAnnotation(saved);

      expect(component.annotations()).toEqual([]);
      expect(await library.annotationsOf('doc-a')).toEqual([]);
    });

    it('goToAnnotation porta alla pagina giusta', async () => {
      const component = await withDoc();

      component.goToAnnotation({
        id: 'x', docId: 'doc-a', page: 6, rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15', quote: '', note: '', createdAt: 1,
      });

      expect(component.pageNum()).toBe(6);
    });

    it('la modalità evidenziazione si accende e si spegne', async () => {
      const component = await withDoc();

      expect(component.annotateMode()).toBe(false);
      component.toggleAnnotateMode();
      expect(component.annotateMode()).toBe(true);
      component.toggleAnnotateMode();
      expect(component.annotateMode()).toBe(false);
    });

    it('il colore attivo cambia quello delle nuove evidenziazioni', async () => {
      const component = await withDoc();

      component.setColor('#60a5fa');

      expect(component.activeColor()).toBe('#60a5fa');
    });

    it('chiudere il documento stacca annotazioni e legame con la libreria', async () => {
      const component = await withDoc();
      component.toggleAnnotateMode();

      component.close();

      expect(component.libraryDoc()).toBeNull();
      expect(component.annotations()).toEqual([]);
      expect(component.annotateMode()).toBe(false);
      expect(component.canAnnotate()).toBe(false);
    });
  });

  describe('esportazione', () => {
    it('manda le note all editor passando dal Workspace', async () => {
      await library.add(meta('doc-a', 'Manuale di Volo'), pdf());
      queryParams = { doc: 'doc-a' };
      const component = create();
      await waitFor(() => component.libraryDoc() !== null);
      component.annotations.set([
        {
          id: 'x', docId: 'doc-a', page: 3, rect: { x: 0, y: 0, w: 1, h: 0.1 },
          color: '#facc15', quote: 'la portanza', note: 'capire meglio', createdAt: 1,
        },
      ]);

      component.exportAnnotations();

      const sent = workspace.send.mock.calls[0][0];
      expect(sent).toMatchObject({ kind: 'text', filename: 'Manuale di Volo.md', fromTool: 'viewer' });
      expect(sent.text).toContain('# Manuale di Volo');
      expect(sent.text).toContain('## Pagina 3');
      expect(sent.text).toContain('> la portanza');
      expect(sent.text).toContain('capire meglio');
      expect(router.navigate).toHaveBeenCalledWith(['/lab/editor']);
    });

    it('non esporta nulla quando non ci sono annotazioni', async () => {
      await library.add(meta(), pdf());
      queryParams = { doc: 'doc-a' };
      const component = create();
      await waitFor(() => component.libraryDoc() !== null);

      component.exportAnnotations();

      expect(workspace.send).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('non esporta da un documento non in libreria', () => {
      const component = create();

      component.exportAnnotations();

      expect(workspace.send).not.toHaveBeenCalled();
    });
  });
});
