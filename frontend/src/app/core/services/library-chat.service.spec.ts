// Installa i globali IndexedDB (indexedDB, IDBKeyRange, ...) che jsdom non fornisce.
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LibraryChatService } from './library-chat.service';
import { LibraryService, IDB_FACTORY } from './library.service';
import { environment } from '@env/environment';

type NewDocMeta = Parameters<LibraryService['add']>[0];

function meta(id: string, title: string): NewDocMeta {
  return {
    id, title, author: '', year: '', source: 'internet_archive', sourceLabel: 'Internet Archive',
    detailsUrl: '', coverUrl: null,
  };
}

const pdf = () => new Blob([new Uint8Array(8)], { type: 'application/pdf' });

describe('LibraryChatService', () => {
  let service: LibraryChatService;
  let library: LibraryService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: IDB_FACTORY, useValue: new IDBFactory() },
      ],
    });
    service = TestBed.inject(LibraryChatService);
    library = TestBed.inject(LibraryService);
    httpMock = TestBed.inject(HttpTestingController);
    await library.refresh();
  });

  afterEach(() => httpMock.verify());

  describe('retrieve', () => {
    beforeEach(async () => {
      await library.add(meta('doc-a', 'Manuale di Volo'), pdf());
      await library.indexPages('doc-a', [
        { page: 1, text: 'La portanza nasce dalla differenza di pressione fra dorso e ventre dell ala.' },
        { page: 2, text: 'Il carrello va esteso prima dell avvicinamento finale.' },
      ]);
    });

    it('restituisce il testo pieno della pagina, non lo snippet della ricerca', async () => {
      const passages = await service.retrieve('portanza');

      expect(passages).toHaveLength(1);
      expect(passages[0].page).toBe(1);
      expect(passages[0].docTitle).toBe('Manuale di Volo');
      expect(passages[0].text).toContain('differenza di pressione');
      expect(passages[0].text).not.toContain('«');
    });

    it('restituisce lista vuota quando nulla corrisponde', async () => {
      expect(await service.retrieve('elicottero')).toEqual([]);
    });

    it('attinge da più documenti quando la domanda tocca entrambi', async () => {
      await library.add(meta('doc-b', 'Meteorologia'), pdf());
      await library.indexPages('doc-b', [{ page: 4, text: 'La portanza cala con aria calda e rarefatta.' }]);

      const passages = await service.retrieve('portanza');

      expect(new Set(passages.map((p) => p.docTitle))).toEqual(
        new Set(['Manuale di Volo', 'Meteorologia']),
      );
    });

    it('restringe a un solo documento quando viene passato docId', async () => {
      await library.add(meta('doc-b', 'Meteorologia'), pdf());
      await library.indexPages('doc-b', [{ page: 4, text: 'La portanza cala con aria calda.' }]);

      const passages = await service.retrieve('portanza', 'doc-b');

      expect(passages.map((p) => p.docTitle)).toEqual(['Meteorologia']);
    });

    it('non manda mai più di sei passaggi', async () => {
      await library.indexPages(
        'doc-a',
        Array.from({ length: 20 }, (_, i) => ({ page: i + 1, text: 'portanza portanza' })),
      );

      expect(await service.retrieve('portanza')).toHaveLength(6);
    });

    it('tronca una pagina lunga entro il limite accettato dal backend', async () => {
      await library.indexPages('doc-a', [{ page: 1, text: `portanza ${'x'.repeat(9000)}` }]);

      const [passage] = await service.retrieve('portanza');

      expect(passage.text.length).toBe(3500);
    });

    it('salta le pagine il cui testo è nel frattempo sparito', async () => {
      await library.indexPages('doc-a', [{ page: 1, text: 'portanza' }]);
      // Reindicizzazione con la stessa pagina vuota: la ricerca non la troverà più.
      await library.indexPages('doc-a', [{ page: 1, text: '' }]);

      expect(await service.retrieve('portanza')).toEqual([]);
    });
  });

  describe('ask', () => {
    it('invia domanda, passaggi e lingua all endpoint ask-document', async () => {
      const passages = [{ docTitle: 'Manuale', page: 3, text: 'un brano' }];
      const promise = firstValueFrom(service.ask('Come funziona?', passages, 'it'));

      const req = httpMock.expectOne(`${environment.apiUrl}/ai/ask-document`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question: 'Come funziona?', passages, lang: 'it' });

      req.flush({ answer: 'Così.', grounded: true, citations: [{ page: 3, docTitle: 'Manuale' }], processingTime: 10 });

      const result = await promise;
      expect(result.answer).toBe('Così.');
      expect(result.citations[0].page).toBe(3);
    });
  });
});
