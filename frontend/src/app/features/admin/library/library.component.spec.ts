// Installa i globali IndexedDB (indexedDB, IDBKeyRange, ...) che jsdom non fornisce.
import 'fake-indexeddb/auto';
import { PLATFORM_ID, importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LibraryComponent } from './library.component';
import { LibraryService, IDB_FACTORY } from '../../../core/services/library.service';
import { LibraryChatService } from '../../../core/services/library-chat.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { SeoService } from '../../../core/services/seo.service';

type NewDocMeta = Parameters<LibraryService['add']>[0];

function meta(id: string, title: string, overrides: Partial<NewDocMeta> = {}): NewDocMeta {
  return {
    id, title, author: 'Autore', year: '1900', source: 'internet_archive',
    sourceLabel: 'Internet Archive', detailsUrl: '', coverUrl: null,
    ...overrides,
  };
}

const pdf = (size = 64) => new Blob([new Uint8Array(size)], { type: 'application/pdf' });

describe('LibraryComponent', () => {
  let library: LibraryService;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let workspace: {
    send: ReturnType<typeof vi.fn>;
    peek: ReturnType<typeof vi.fn>;
    take: ReturnType<typeof vi.fn>;
  };
  let chat: { retrieve: ReturnType<typeof vi.fn>; ask: ReturnType<typeof vi.fn> };
  let pdfjs: { openDocument: ReturnType<typeof vi.fn>; extractPages: ReturnType<typeof vi.fn> };

  function configure(): void {
    router = { navigate: vi.fn() };
    workspace = { send: vi.fn(), peek: vi.fn().mockReturnValue(null), take: vi.fn() };
    chat = { retrieve: vi.fn().mockResolvedValue([]), ask: vi.fn() };
    pdfjs = {
      openDocument: vi.fn().mockResolvedValue({ numPages: 2, loadingTask: { destroy: vi.fn() } }),
      extractPages: vi.fn().mockResolvedValue([
        { page: 1, text: 'La portanza nasce dalla differenza di pressione.' },
        { page: 2, text: 'Il carrello va esteso prima dell avvicinamento.' },
      ]),
    };

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: IDB_FACTORY, useValue: new IDBFactory() },
        { provide: LibraryChatService, useValue: chat },
        { provide: PdfjsService, useValue: pdfjs },
        { provide: WorkspaceService, useValue: workspace },
        { provide: Router, useValue: router },
        { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    library = TestBed.inject(LibraryService);
  }

  /** Attende una condizione, per il lavoro asincrono che il componente avvia da solo. */
  async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('condizione non raggiunta entro il timeout');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  async function create() {
    const fixture = TestBed.createComponent(LibraryComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    // ngOnInit avvia init() in modo asincrono: lasciala completare prima di asserire.
    await waitFor(() => component.ready() && !component.importing());
    return component;
  }

  beforeEach(() => configure());
  afterEach(() => vi.restoreAllMocks());

  describe('elenco e ordinamento', () => {
    it('mostra i documenti dal più recente per impostazione predefinita', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      await library.add(meta('b', 'Beta'), pdf());
      const component = await create();

      expect(component.visibleDocs().map((d) => d.id)).toEqual(['b', 'a']);
    });

    it('ordina per titolo', async () => {
      await library.add(meta('z', 'Zeta'), pdf());
      await library.add(meta('a', 'Alfa'), pdf());
      const component = await create();

      component.sortBy.set('title');
      expect(component.visibleDocs().map((d) => d.title)).toEqual(['Alfa', 'Zeta']);
    });

    it('ordina per dimensione decrescente', async () => {
      await library.add(meta('small', 'Piccolo'), pdf(10));
      await library.add(meta('big', 'Grande'), pdf(9000));
      const component = await create();

      component.sortBy.set('size');
      expect(component.visibleDocs().map((d) => d.id)).toEqual(['big', 'small']);
    });

    it('filtra per tag e torna a mostrare tutto', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      await library.add(meta('b', 'Beta'), pdf());
      await library.setTags('a', ['storia']);
      const component = await create();

      component.filterByTag('storia');
      expect(component.visibleDocs().map((d) => d.id)).toEqual(['a']);

      component.filterByTag(null);
      expect(component.visibleDocs()).toHaveLength(2);
    });
  });

  describe('statistiche', () => {
    it('conta indicizzati e da indicizzare', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      await library.add(meta('b', 'Beta'), pdf());
      await library.indexPages('a', [{ page: 1, text: 'testo abbastanza lungo da contare' }]);
      const component = await create();

      expect(component.indexedCount()).toBe(1);
      expect(component.pendingIndexCount()).toBe(1);
    });

    it('non considera cercabile una scansione senza testo', async () => {
      await library.add(meta('a', 'Scansione'), pdf());
      await library.indexPages('a', [{ page: 1, text: '' }]);
      const component = await create();

      expect(component.indexedCount()).toBe(1);
      expect(component.searchableCount()).toBe(0);
    });

    it('formatta la dimensione in modo leggibile', async () => {
      const component = await create();

      expect(component.formatSize(512)).toBe('512 B');
      expect(component.formatSize(2048)).toBe('2 KB');
      expect(component.formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
    });
  });

  describe('indicizzazione', () => {
    it('estrae il testo e lo salva, rendendo il documento cercabile', async () => {
      await library.add(meta('a', 'Manuale'), pdf());
      const component = await create();

      await component.indexDoc('a');

      expect(pdfjs.extractPages).toHaveBeenCalled();
      expect(library.get('a')?.indexedAt).not.toBeNull();
      expect(await library.search('portanza')).toHaveLength(1);
    });

    it('riporta la percentuale mentre lavora e la ripulisce alla fine', async () => {
      await library.add(meta('a', 'Manuale'), pdf());
      const component = await create();
      const seen: (number | null)[] = [];
      pdfjs.extractPages.mockImplementation(async (_doc: unknown, onProgress: (d: number, t: number) => void) => {
        onProgress(1, 2);
        seen.push(component.progressOf('a'));
        return [{ page: 1, text: 'testo' }];
      });

      await component.indexDoc('a');

      expect(seen).toEqual([50]);
      expect(component.progressOf('a')).toBeNull();
    });

    it('segnala l errore e non lascia il documento bloccato in "indicizzazione"', async () => {
      await library.add(meta('a', 'Rotto'), pdf());
      const component = await create();
      pdfjs.openDocument.mockRejectedValue(new Error('pdf corrotto'));

      await component.indexDoc('a');

      expect(component.error()).toBeTruthy();
      expect(component.progressOf('a')).toBeNull();
    });

    it('indexAllPending lavora solo sui documenti non ancora indicizzati', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      await library.add(meta('b', 'Beta'), pdf());
      await library.indexPages('a', [{ page: 1, text: 'testo abbastanza lungo da contare' }]);
      const component = await create();

      await component.indexAllPending();

      expect(pdfjs.extractPages).toHaveBeenCalledTimes(1);
    });
  });

  describe('ponte verso i tool', () => {
    it('manda il PDF al Workspace e apre il tool scelto', async () => {
      await library.add(meta('a', 'Un Libro'), pdf(128));
      const component = await create();

      await component.sendToTool(library.get('a')!, { id: 'ocr', icon: '🔤', route: '/lab/ocr' });

      const sent = workspace.send.mock.calls[0][0];
      expect(sent).toMatchObject({ kind: 'file', filename: 'Un Libro.pdf', fromTool: 'library' });
      expect(sent.blob.size).toBe(128);
      expect(router.navigate).toHaveBeenCalledWith(['/lab/ocr']);
    });

    it('ripulisce dal nome file i caratteri che il filesystem rifiuta', async () => {
      await library.add(meta('a', 'Titolo: con / caratteri * strani?'), pdf());
      const component = await create();

      await component.sendToTool(library.get('a')!, { id: 'ocr', icon: '🔤', route: '/lab/ocr' });

      expect(workspace.send.mock.calls[0][0].filename).toBe('Titolo con  caratteri  strani.pdf');
    });

    it('apre il viewer sulla pagina del risultato di ricerca', async () => {
      await library.add(meta('a', 'Manuale'), pdf());
      await library.indexPages('a', [
        { page: 1, text: 'niente qui' },
        { page: 2, text: 'qui invece si parla di portanza' },
      ]);
      const component = await create();

      component.query.set('portanza');
      await component.runSearch();
      component.openHit(component.hits()[0]);

      expect(router.navigate).toHaveBeenCalledWith(['/lab/viewer'], { queryParams: { doc: 'a', page: 2 } });
    });
  });

  describe('ricerca nel contenuto', () => {
    beforeEach(async () => {
      await library.add(meta('a', 'Manuale di Volo'), pdf());
      await library.indexPages('a', [
        { page: 1, text: 'La portanza nasce dalla differenza di pressione.' },
      ]);
    });

    it('trova la pagina e la espone con il titolo del documento', async () => {
      const component = await create();
      component.query.set('portanza');

      await component.runSearch();

      expect(component.hits()).toHaveLength(1);
      expect(component.hits()[0].title).toBe('Manuale di Volo');
      expect(component.hasSearched()).toBe(true);
    });

    it('ignora una query troppo corta invece di cercare a vuoto', async () => {
      const component = await create();
      component.query.set('a');

      await component.runSearch();

      expect(component.hasSearched()).toBe(false);
    });

    it('clearSearch riporta la vista allo stato iniziale', async () => {
      const component = await create();
      component.query.set('portanza');
      await component.runSearch();

      component.clearSearch();

      expect(component.query()).toBe('');
      expect(component.hits()).toEqual([]);
      expect(component.hasSearched()).toBe(false);
    });

    it('eliminare un documento toglie anche i suoi risultati dalla lista', async () => {
      const component = await create();
      component.query.set('portanza');
      await component.runSearch();
      expect(component.hits()).toHaveLength(1);

      await component.remove(library.get('a')!);

      expect(component.hits()).toEqual([]);
      expect(component.docs()).toHaveLength(0);
    });
  });

  describe('snippetParts', () => {
    it('separa i termini trovati dal resto del testo', async () => {
      const component = await create();

      expect(component.snippetParts('prima «voce» dopo')).toEqual([
        { text: 'prima ', hit: false },
        { text: 'voce', hit: true },
        { text: ' dopo', hit: false },
      ]);
    });

    it('gestisce più occorrenze', async () => {
      const component = await create();

      expect(component.snippetParts('«a» e «b»').filter((p) => p.hit).map((p) => p.text)).toEqual(['a', 'b']);
    });

    it('lascia intatto uno snippet senza marcatori', async () => {
      const component = await create();

      expect(component.snippetParts('nessuna evidenziazione')).toEqual([
        { text: 'nessuna evidenziazione', hit: false },
      ]);
    });

    it('non va in loop su un marcatore di apertura senza chiusura', async () => {
      const component = await create();

      expect(component.snippetParts('rotto « qui')).toEqual([{ text: 'rotto « qui', hit: false }]);
    });
  });

  describe('tag', () => {
    it('salva i tag scritti separati da virgola', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      const component = await create();

      component.startTagEdit(library.get('a')!);
      component.tagDraft.set('storia, saggi');
      await component.saveTags(library.get('a')!);

      expect(library.get('a')?.tags).toEqual(['storia', 'saggi']);
      expect(component.tagEditorId()).toBeNull();
    });

    it('annullare non tocca i tag esistenti', async () => {
      await library.add(meta('a', 'Alfa'), pdf());
      await library.setTags('a', ['storia']);
      const component = await create();

      component.startTagEdit(library.get('a')!);
      component.tagDraft.set('tutto sbagliato');
      component.cancelTagEdit();

      expect(library.get('a')?.tags).toEqual(['storia']);
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      await library.add(meta('a', 'Manuale'), pdf());
      await library.indexPages('a', [{ page: 3, text: 'La portanza nasce dalla pressione.' }]);
    });

    it('aggiunge domanda e risposta alla conversazione, con le citazioni', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(
        of({ answer: 'Dalla pressione.', grounded: true, citations: [{ page: 3, docTitle: 'Manuale' }], processingTime: 5 }),
      );
      const component = await create();
      component.chatInput.set('Come nasce la portanza?');

      await component.ask();

      expect(component.messages()).toHaveLength(2);
      expect(component.messages()[0]).toMatchObject({ role: 'user', text: 'Come nasce la portanza?' });
      expect(component.messages()[1]).toMatchObject({ role: 'assistant', text: 'Dalla pressione.' });
      expect(component.messages()[1].citations).toEqual([{ page: 3, docTitle: 'Manuale' }]);
      expect(component.chatInput()).toBe('');
      expect(component.asking()).toBe(false);
    });

    it('restringe la ricerca al documento quando la chat è aperta su uno solo', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(of({ answer: 'ok', grounded: true, citations: [], processingTime: 1 }));
      const component = await create();

      component.openChat('a');
      component.chatInput.set('Una domanda');
      await component.ask();

      expect(chat.retrieve).toHaveBeenCalledWith('Una domanda', 'a');
    });

    it('interroga tutta la libreria quando la chat è aperta senza documento', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(of({ answer: 'ok', grounded: true, citations: [], processingTime: 1 }));
      const component = await create();

      component.openChat(null);
      component.chatInput.set('Una domanda');
      await component.ask();

      expect(chat.retrieve).toHaveBeenCalledWith('Una domanda', undefined);
    });

    it('non chiama il modello quando non c è nulla di pertinente da mandargli', async () => {
      chat.retrieve.mockResolvedValue([]);
      const component = await create();
      component.chatInput.set('Domanda senza risposta');

      await component.ask();

      expect(chat.ask).not.toHaveBeenCalled();
      expect(component.messages()[1].ungrounded).toBe(true);
    });

    it('segnala una risposta non fondata sui documenti', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(
        of({ answer: 'Non risulta dagli estratti.', grounded: false, citations: [], processingTime: 1 }),
      );
      const component = await create();
      component.chatInput.set('Chi ha vinto nel 1998?');

      await component.ask();

      expect(component.messages()[1].ungrounded).toBe(true);
    });

    it('mostra un messaggio di errore se la richiesta fallisce, senza bloccare la chat', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(throwError(() => new Error('rete')));
      const component = await create();
      component.chatInput.set('Una domanda');

      await component.ask();

      expect(component.messages()).toHaveLength(2);
      expect(component.messages()[1].ungrounded).toBe(true);
      expect(component.asking()).toBe(false);
    });

    it('ignora una domanda troppo corta', async () => {
      const component = await create();
      component.chatInput.set('ok');

      await component.ask();

      expect(component.messages()).toEqual([]);
      expect(chat.retrieve).not.toHaveBeenCalled();
    });

    it('chiudere la chat su un documento eliminato non lascia uno scope orfano', async () => {
      const component = await create();
      component.openChat('a');

      await component.remove(library.get('a')!);

      expect(component.chatScope()).toBeNull();
    });

    it('clearChat svuota la conversazione', async () => {
      chat.retrieve.mockResolvedValue([{ docTitle: 'Manuale', page: 3, text: 'brano' }]);
      chat.ask.mockReturnValue(of({ answer: 'ok', grounded: true, citations: [], processingTime: 1 }));
      const component = await create();
      component.chatInput.set('Una domanda');
      await component.ask();

      component.clearChat();

      expect(component.messages()).toEqual([]);
    });
  });

  describe('import', () => {
    it('archivia il PDF caricato e lo indicizza subito', async () => {
      const component = await create();
      const file = new File([new Uint8Array(32)], 'appunti.pdf', { type: 'application/pdf' });

      await component.importFiles([file] as unknown as FileList);

      expect(component.docs()).toHaveLength(1);
      expect(component.docs()[0].title).toBe('appunti');
      expect(component.docs()[0].indexedAt).not.toBeNull();
      expect(component.importing()).toBe(false);
    });

    it('scarta i file che non sono PDF', async () => {
      const component = await create();
      const file = new File([new Uint8Array(4)], 'foto.png', { type: 'image/png' });

      await component.importFiles([file] as unknown as FileList);

      expect(component.docs()).toEqual([]);
    });

    it('non fa nulla senza file selezionati', async () => {
      const component = await create();

      await component.importFiles(null);

      expect(component.importing()).toBe(false);
      expect(component.docs()).toEqual([]);
    });
  });

  describe('ricezione dal Workspace', () => {
    it('archivia e indicizza il PDF mandato da un altro tool', async () => {
      workspace.peek.mockReturnValue({
        kind: 'file',
        blob: pdf(256),
        filename: 'relazione.pdf',
        mime: 'application/pdf',
        fromTool: 'convert',
        createdAt: Date.now(),
      });

      const component = await create();

      expect(component.docs()).toHaveLength(1);
      expect(component.docs()[0].title).toBe('relazione');
      expect(component.docs()[0].indexedAt).not.toBeNull();
    });

    it('consuma l elemento, così non viene reimportato a ogni visita', async () => {
      workspace.peek.mockReturnValue({
        kind: 'file', blob: pdf(), filename: 'x.pdf', mime: 'application/pdf',
        fromTool: 'scanner', createdAt: Date.now(),
      });

      await create();

      expect(workspace.take).toHaveBeenCalled();
    });

    it('ignora un elemento di testo', async () => {
      workspace.peek.mockReturnValue({
        kind: 'text', text: 'appunti', filename: 'note.txt', fromTool: 'ocr', createdAt: Date.now(),
      });

      const component = await create();

      expect(component.docs()).toEqual([]);
      expect(workspace.take).not.toHaveBeenCalled();
    });

    it('ignora un file che non è un PDF', async () => {
      workspace.peek.mockReturnValue({
        kind: 'file', blob: new Blob([new Uint8Array(4)]), filename: 'foto.png',
        mime: 'image/png', fromTool: 'scanner', createdAt: Date.now(),
      });

      const component = await create();

      expect(component.docs()).toEqual([]);
    });

    it('non riprende un file che la Libreria stessa aveva appena mandato altrove', async () => {
      workspace.peek.mockReturnValue({
        kind: 'file', blob: pdf(), filename: 'giro.pdf', mime: 'application/pdf',
        fromTool: 'library', createdAt: Date.now(),
      });

      const component = await create();

      expect(component.docs()).toEqual([]);
      expect(workspace.take).not.toHaveBeenCalled();
    });

    it('non fa nulla quando il Workspace è vuoto', async () => {
      const component = await create();

      expect(component.docs()).toEqual([]);
      expect(workspace.take).not.toHaveBeenCalled();
    });
  });
});
