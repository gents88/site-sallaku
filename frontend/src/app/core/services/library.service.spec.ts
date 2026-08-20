// Installa i globali IndexedDB (indexedDB, IDBKeyRange, ...) che jsdom non fornisce.
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { LibraryService, LibraryDoc, IDB_FACTORY, tokenize, HIGHLIGHT_OPEN } from './library.service';

type NewDocMeta = Parameters<LibraryService['add']>[0];

function meta(overrides: Partial<NewDocMeta> = {}): NewDocMeta {
  return {
    id: 'ia-alice',
    title: 'Alice nel Paese delle Meraviglie',
    author: 'Lewis Carroll',
    year: '1865',
    source: 'internet_archive',
    sourceLabel: 'Internet Archive',
    detailsUrl: 'https://archive.org/details/alice',
    coverUrl: null,
    ...overrides,
  };
}

function blob(size = 1024): Blob {
  return new Blob([new Uint8Array(size)], { type: 'application/pdf' });
}

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      // Un IDBFactory nuovo per ogni test: jsdom non ha IndexedDB e i test
      // non devono vedersi i dati a vicenda.
      providers: [{ provide: IDB_FACTORY, useValue: new IDBFactory() }],
    });
    service = TestBed.inject(LibraryService);
    await service.refresh();
  });

  describe('tokenize', () => {
    it('normalizza minuscole, diacritici e punteggiatura', () => {
      expect(tokenize("L'Ètà Perduta, vol. 2")).toEqual(['eta', 'perduta', 'vol']);
    });

    it('scarta i token di un solo carattere', () => {
      expect(tokenize('a b test')).toEqual(['test']);
    });
  });

  describe('add / get / remove', () => {
    it('salva un documento e lo espone nel signal docs', async () => {
      const doc = await service.add(meta(), blob(2048));

      expect(doc.size).toBe(2048);
      expect(doc.indexedAt).toBeNull();
      expect(service.docs()).toHaveLength(1);
      expect(service.has('ia-alice')).toBe(true);
    });

    it('sopravvive a una riapertura del database', async () => {
      await service.add(meta(), blob());

      const reloaded = await service.refresh();
      expect(reloaded.map((d) => d.id)).toEqual(['ia-alice']);
    });

    it('risalvare lo stesso id aggiorna invece di duplicare, e conserva addedAt', async () => {
      const first = await service.add(meta(), blob(100));
      const second = await service.add(meta({ title: 'Titolo corretto' }), blob(200));

      expect(service.docs()).toHaveLength(1);
      expect(second.title).toBe('Titolo corretto');
      expect(second.size).toBe(200);
      expect(second.addedAt).toBe(first.addedAt);
    });

    it('risalvare azzera il testo indicizzato, che si riferiva al blob precedente', async () => {
      await service.add(meta(), blob());
      await service.indexPages('ia-alice', [{ page: 1, text: 'testo lungo abbastanza da contare' }]);
      expect(service.get('ia-alice')?.indexedAt).not.toBeNull();

      await service.add(meta(), blob(50));
      expect(service.get('ia-alice')?.indexedAt).toBeNull();
      expect(service.get('ia-alice')?.textChars).toBe(0);
    });

    it('conserva i tag già assegnati quando il documento viene risalvato', async () => {
      await service.add(meta(), blob());
      await service.setTags('ia-alice', ['classici']);

      const updated = await service.add(meta(), blob());
      expect(updated.tags).toEqual(['classici']);
    });

    it('restituisce il blob salvato', async () => {
      await service.add(meta(), blob(512));

      const stored = await service.getBlob('ia-alice');
      expect(stored?.size).toBe(512);
    });

    it('remove cancella documento, blob, pagine e annotazioni', async () => {
      await service.add(meta(), blob());
      await service.indexPages('ia-alice', [{ page: 1, text: 'un testo qualsiasi' }]);
      await service.addAnnotation({
        docId: 'ia-alice',
        page: 1,
        rect: { x: 0, y: 0, w: 0.5, h: 0.1 },
        color: '#facc15',
        quote: 'un testo',
        note: '',
      });

      await service.remove('ia-alice');

      expect(service.docs()).toHaveLength(0);
      expect(await service.getBlob('ia-alice')).toBeNull();
      expect(await service.pagesOf('ia-alice')).toEqual([]);
      expect(await service.annotationsOf('ia-alice')).toEqual([]);
    });
  });

  describe('tag', () => {
    it('deduplica, ripulisce gli spazi e scarta i tag vuoti', async () => {
      await service.add(meta(), blob());
      await service.setTags('ia-alice', [' storia ', 'storia', '', '  ', 'saggi']);

      expect(service.get('ia-alice')?.tags).toEqual(['storia', 'saggi']);
    });

    it('allTags raccoglie i tag di tutti i documenti in ordine alfabetico', async () => {
      await service.add(meta(), blob());
      await service.add(meta({ id: 'arxiv-1', title: 'Un paper' }), blob());
      await service.setTags('ia-alice', ['romanzi']);
      await service.setTags('arxiv-1', ['fisica', 'romanzi']);

      expect(service.allTags()).toEqual(['fisica', 'romanzi']);
    });
  });

  describe('indexPages', () => {
    it('registra le pagine e i contatori di testo', async () => {
      await service.add(meta(), blob());

      const updated = await service.indexPages('ia-alice', [
        { page: 1, text: 'Nel mezzo del cammin di nostra vita' },
        { page: 2, text: 'mi ritrovai per una selva oscura' },
      ]);

      expect(updated?.pageCount).toBe(2);
      expect(updated?.indexedAt).not.toBeNull();
      expect(updated?.textChars).toBe(67);
      expect(updated?.isScanned).toBe(false);
      expect((await service.pagesOf('ia-alice')).map((p) => p.page)).toEqual([1, 2]);
    });

    it('marca come scansione un PDF quasi privo di testo estraibile', async () => {
      await service.add(meta(), blob());

      const updated = await service.indexPages('ia-alice', [
        { page: 1, text: '' },
        { page: 2, text: '3' },
      ]);

      expect(updated?.isScanned).toBe(true);
    });

    it('reindicizzare sostituisce le pagine precedenti invece di sommarle', async () => {
      await service.add(meta(), blob());
      await service.indexPages('ia-alice', [
        { page: 1, text: 'vecchio' },
        { page: 2, text: 'vecchio' },
        { page: 3, text: 'vecchio' },
      ]);

      await service.indexPages('ia-alice', [{ page: 1, text: 'nuovo testo' }]);

      const pages = await service.pagesOf('ia-alice');
      expect(pages).toHaveLength(1);
      expect(pages[0].text).toBe('nuovo testo');
    });

    it('ignora un documento non presente in libreria', async () => {
      expect(await service.indexPages('inesistente', [{ page: 1, text: 'x' }])).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await service.add(meta(), blob());
      await service.add(meta({ id: 'gut-divina', title: 'Divina Commedia' }), blob());
      await service.indexPages('ia-alice', [
        { page: 1, text: 'Alice cominciava a essere stanca di sedere sulla riva' },
        { page: 2, text: 'Il Coniglio Bianco corse via veloce, veloce come il vento' },
      ]);
      await service.indexPages('gut-divina', [
        { page: 7, text: 'Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura' },
      ]);
    });

    it('trova la pagina giusta nel documento giusto', async () => {
      const hits = await service.search('coniglio');

      expect(hits).toHaveLength(1);
      expect(hits[0].docId).toBe('ia-alice');
      expect(hits[0].page).toBe(2);
      expect(hits[0].title).toBe('Alice nel Paese delle Meraviglie');
    });

    it('cerca in tutta la libreria, non solo nell ultimo documento', async () => {
      const hits = await service.search('selva');

      expect(hits.map((h) => h.docId)).toEqual(['gut-divina']);
      expect(hits[0].page).toBe(7);
    });

    it('restringe a un solo documento quando viene passato docId', async () => {
      const hits = await service.search('nostra vita', 40, 'ia-alice');

      expect(hits).toEqual([]);
    });

    it('ignora accenti e maiuscole', async () => {
      const hits = await service.search('CONIGLIO');
      expect(hits).toHaveLength(1);
    });

    it('marca i termini trovati nello snippet', async () => {
      const hits = await service.search('coniglio');

      expect(hits[0].snippet).toContain(`${HIGHLIGHT_OPEN}Coniglio`);
    });

    it('classifica più in alto la pagina che contiene tutti i termini', async () => {
      await service.indexPages('ia-alice', [
        { page: 1, text: 'coniglio coniglio coniglio coniglio' },
        { page: 2, text: 'un coniglio bianco' },
      ]);

      const hits = await service.search('coniglio bianco');

      expect(hits[0].page).toBe(2);
    });

    it('restituisce nulla per una query fatta solo di token scartati', async () => {
      expect(await service.search('a')).toEqual([]);
    });

    it('rispetta il limite richiesto', async () => {
      await service.indexPages(
        'ia-alice',
        Array.from({ length: 10 }, (_, i) => ({ page: i + 1, text: 'veloce' })),
      );

      expect(await service.search('veloce', 3)).toHaveLength(3);
    });
  });

  describe('annotazioni', () => {
    beforeEach(async () => {
      await service.add(meta(), blob());
    });

    it('salva e rilegge un evidenziazione', async () => {
      const saved = await service.addAnnotation({
        docId: 'ia-alice',
        page: 3,
        rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 },
        color: '#facc15',
        quote: 'sedere sulla riva',
        note: 'incipit',
      });

      const all = await service.annotationsOf('ia-alice');
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(saved.id);
      expect(all[0].quote).toBe('sedere sulla riva');
    });

    it('ordina per pagina e poi per posizione verticale', async () => {
      const base = { docId: 'ia-alice', color: '#facc15', quote: '', note: '' };
      await service.addAnnotation({ ...base, page: 5, rect: { x: 0, y: 0.1, w: 0.1, h: 0.1 } });
      await service.addAnnotation({ ...base, page: 2, rect: { x: 0, y: 0.8, w: 0.1, h: 0.1 } });
      await service.addAnnotation({ ...base, page: 2, rect: { x: 0, y: 0.3, w: 0.1, h: 0.1 } });

      const all = await service.annotationsOf('ia-alice');
      expect(all.map((a) => [a.page, a.rect.y])).toEqual([
        [2, 0.3],
        [2, 0.8],
        [5, 0.1],
      ]);
    });

    it('aggiorna la nota lasciando intatto il resto', async () => {
      const saved = await service.addAnnotation({
        docId: 'ia-alice',
        page: 1,
        rect: { x: 0, y: 0, w: 1, h: 0.1 },
        color: '#facc15',
        quote: 'citazione',
        note: '',
      });

      await service.updateAnnotation(saved.id, { note: 'da rileggere' });

      const [updated] = await service.annotationsOf('ia-alice');
      expect(updated.note).toBe('da rileggere');
      expect(updated.quote).toBe('citazione');
      expect(updated.createdAt).toBe(saved.createdAt);
    });

    it('rimuove una singola annotazione', async () => {
      const a = await service.addAnnotation({
        docId: 'ia-alice', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 }, color: '#facc15', quote: '', note: '',
      });
      const b = await service.addAnnotation({
        docId: 'ia-alice', page: 2, rect: { x: 0, y: 0, w: 1, h: 0.1 }, color: '#f87171', quote: '', note: '',
      });

      await service.removeAnnotation(a.id);

      expect((await service.annotationsOf('ia-alice')).map((x) => x.id)).toEqual([b.id]);
    });

    it('tiene separate le annotazioni di documenti diversi', async () => {
      await service.add(meta({ id: 'gut-divina', title: 'Divina Commedia' }), blob());
      await service.addAnnotation({
        docId: 'gut-divina', page: 1, rect: { x: 0, y: 0, w: 1, h: 0.1 }, color: '#facc15', quote: '', note: '',
      });

      expect(await service.annotationsOf('ia-alice')).toEqual([]);
      expect(await service.annotationsOf('gut-divina')).toHaveLength(1);
    });
  });

  describe('usedBytes', () => {
    it('somma la dimensione dei PDF salvati', async () => {
      await service.add(meta(), blob(1000));
      await service.add(meta({ id: 'gut-divina' }), blob(2500));

      expect(service.usedBytes()).toBe(3500);
    });
  });

  describe('senza IndexedDB', () => {
    it('refresh degrada a lista vuota invece di lanciare', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: IDB_FACTORY, useValue: null }],
      });
      const offline = TestBed.inject(LibraryService);

      expect(await offline.refresh()).toEqual([]);
      expect(offline.ready()).toBe(true);
      expect(offline.available()).toBe(false);
    });

    it('search degrada a lista vuota', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [{ provide: IDB_FACTORY, useValue: null }],
      });
      const offline = TestBed.inject(LibraryService);

      expect(await offline.search('qualsiasi')).toEqual([]);
    });
  });
});

describe('LibraryDoc', () => {
  it('il tipo espone i campi che le viste consumano', () => {
    const doc: LibraryDoc = {
      id: 'x', title: 't', author: 'a', year: '2020', source: 'upload', sourceLabel: 'Caricato',
      detailsUrl: '', coverUrl: null, size: 1, pageCount: 1, tags: [], addedAt: 1, indexedAt: null,
      textChars: 0, isScanned: false,
    };
    expect(doc.source).toBe('upload');
  });
});
