import { PLATFORM_ID, signal, importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PdfSearchComponent } from './pdf-search.component';
import { PdfSearchService, PdfSearchResult } from '../../../core/services/pdf-search.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { LibraryService } from '../../../core/services/library.service';

function makeResult(overrides: Partial<PdfSearchResult> = {}): PdfSearchResult {
  return {
    id: 'r-1', title: 'Title', author: '', year: '', source: 'internet_archive', sourceLabel: 'Internet Archive',
    pdfUrl: 'https://archive.org/download/x/x.pdf', coverUrl: null, detailsUrl: 'https://archive.org/details/x',
    previewable: true, scanPpi: null,
    ...overrides,
  };
}

describe('PdfSearchComponent', () => {
  let searchMock: ReturnType<typeof vi.fn>;
  let downloadBlobMock: ReturnType<typeof vi.fn>;
  let libraryMock: {
    refresh: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    indexPages: ReturnType<typeof vi.fn>;
    has: ReturnType<typeof vi.fn>;
  };
  let pdfjsMock: { openDocument: ReturnType<typeof vi.fn>; extractPages: ReturnType<typeof vi.fn>; renderPageToBlob: ReturnType<typeof vi.fn> };

  function configure(): void {
    searchMock = vi.fn().mockReturnValue(of([]));
    downloadBlobMock = vi.fn();
    libraryMock = {
      refresh: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue(undefined),
      indexPages: vi.fn().mockResolvedValue(null),
      has: vi.fn().mockReturnValue(false),
    };
    pdfjsMock = {
      openDocument: vi.fn().mockResolvedValue({ numPages: 1, loadingTask: { destroy: vi.fn() } }),
      extractPages: vi.fn().mockResolvedValue([{ page: 1, text: 'testo' }]),
      renderPageToBlob: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        {
          provide: PdfSearchService,
          useValue: { isLoading: signal(false), search: searchMock, downloadBlob: downloadBlobMock },
        },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
        { provide: WorkspaceService, useValue: { send: vi.fn() } },
        { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
        { provide: PdfjsService, useValue: pdfjsMock },
        { provide: LibraryService, useValue: libraryMock },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('displayResults', () => {
    it('filters by source category (books vs papers)', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.results.set([
        makeResult({ id: 'ia', title: 'Title IA', source: 'internet_archive' }),
        makeResult({ id: 'gb', title: 'Title GB', source: 'gutenberg' }),
        makeResult({ id: 'ax', title: 'Title AX', source: 'arxiv' }),
        makeResult({ id: 'pmc', title: 'Title PMC', source: 'pmc' }),
      ]);

      component.sourceFilter.set('books');
      expect(component.displayResults().map((r) => r.id).sort()).toEqual(['gb', 'ia']);

      component.sourceFilter.set('papers');
      expect(component.displayResults().map((r) => r.id).sort()).toEqual(['ax', 'pmc']);

      component.sourceFilter.set('all');
      expect(component.displayResults()).toHaveLength(4);
    });

    it('sorts by year, newest or oldest first', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.results.set([
        makeResult({ id: 'old', title: 'Old Title', year: '1920' }),
        makeResult({ id: 'new', title: 'New Title', year: '2020' }),
        makeResult({ id: 'mid', title: 'Mid Title', year: '1980' }),
      ]);

      component.sortBy.set('year_desc');
      expect(component.displayResults().map((r) => r.id)).toEqual(['new', 'mid', 'old']);

      component.sortBy.set('year_asc');
      expect(component.displayResults().map((r) => r.id)).toEqual(['old', 'mid', 'new']);
    });

    it('leaves API order untouched when sorting by relevance', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.results.set([makeResult({ id: 'b', title: 'B Title', year: '1920' }), makeResult({ id: 'a', title: 'A Title', year: '2020' })]);
      component.sortBy.set('relevance');

      expect(component.displayResults().map((r) => r.id)).toEqual(['b', 'a']);
    });

    it('groups near-duplicate titles into one card with a duplicateCount, when groupSimilar is on', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.results.set([
        makeResult({ id: 'a1', title: "Alice's Adventures in Wonderland" }),
        makeResult({ id: 'a2', title: "alice's adventures in wonderland!" }), // same work, different casing/punctuation
        makeResult({ id: 'a3', title: 'ALICE’S ADVENTURES IN WONDERLAND' }), // curly apostrophe variant
        makeResult({ id: 'b1', title: 'Dracula' }),
      ]);

      const grouped = component.displayResults();

      expect(grouped).toHaveLength(2);
      const alice = grouped.find((r) => r.id === 'a1')!;
      expect(alice.duplicateCount).toBe(3);
      const dracula = grouped.find((r) => r.id === 'b1')!;
      expect(dracula.duplicateCount).toBe(1);
    });

    it('shows every result ungrouped (duplicateCount 1) when groupSimilar is off', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.results.set([
        makeResult({ id: 'a1', title: 'Same Title' }),
        makeResult({ id: 'a2', title: 'Same Title' }),
      ]);
      component.groupSimilar.set(false);

      const list = component.displayResults();

      expect(list).toHaveLength(2);
      expect(list.every((r) => r.duplicateCount === 1)).toBe(true);
    });
  });

  describe('search only fires on an explicit trigger', () => {
    it('typing into the query signal alone never calls the search API (no search-as-you-type)', async () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.query.set('piccolo');
      // Give any stray async/microtask work a chance to run — there should be none.
      await Promise.resolve();

      expect(searchMock).not.toHaveBeenCalled();
    });

    it('search() only runs for a query of 2+ characters', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      component.query.set('p');
      component.search();
      expect(searchMock).not.toHaveBeenCalled();

      component.query.set('piccolo');
      component.search();
      expect(searchMock).toHaveBeenCalledWith('piccolo');
    });
  });

  describe('scanQuality', () => {
    it('labels a high-resolution scan as hd, a rough capture as low, and everything else as unlabeled', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      const component = fixture.componentInstance;

      expect(component.scanQuality(makeResult({ scanPpi: 400 }))).toBe('hd');
      expect(component.scanQuality(makeResult({ scanPpi: 300 }))).toBe('hd');
      expect(component.scanQuality(makeResult({ scanPpi: 72 }))).toBe('low');
      expect(component.scanQuality(makeResult({ scanPpi: 200 }))).toBeNull();
      expect(component.scanQuality(makeResult({ scanPpi: null }))).toBeNull();
    });
  });

  describe('recent searches (localStorage)', () => {
    it('loads previously saved searches on init', () => {
      localStorage.setItem('pdf-search-recent-queries', JSON.stringify(['dante', 'shakespeare']));
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges(); // runs ngOnInit

      expect(fixture.componentInstance.recentSearches()).toEqual(['dante', 'shakespeare']);
    });

    it('useRecentSearch() re-runs a saved query', () => {
      vi.useFakeTimers();
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      fixture.componentInstance.useRecentSearch('pinocchio');

      expect(searchMock).toHaveBeenCalledWith('pinocchio');
      expect(fixture.componentInstance.query()).toBe('pinocchio');
    });

    it('clearRecentSearches() empties the list and localStorage', () => {
      localStorage.setItem('pdf-search-recent-queries', JSON.stringify(['dante']));
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      fixture.componentInstance.clearRecentSearches();

      expect(fixture.componentInstance.recentSearches()).toEqual([]);
      expect(localStorage.getItem('pdf-search-recent-queries')).toBeNull();
    });

    it('caps the saved list at 8 entries and de-duplicates case-insensitively', () => {
      vi.useFakeTimers();
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      for (let i = 0; i < 9; i++) component.useRecentSearch(`query-${i}`);
      component.useRecentSearch('QUERY-8'); // same as the most recent one, different case

      expect(component.recentSearches()).toHaveLength(8);
      expect(component.recentSearches()[0]).toBe('QUERY-8');
      expect(component.recentSearches().filter((q) => q.toLowerCase() === 'query-8')).toHaveLength(1);
    });
  });

  describe('favorites (localStorage)', () => {
    it('loads previously saved favorites on init', () => {
      const saved = [makeResult({ id: 'fav-1' })];
      localStorage.setItem('pdf-search-favorites', JSON.stringify(saved));
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.favorites().map((f) => f.id)).toEqual(['fav-1']);
    });

    it('toggleFavorite() adds then removes a result, persisting to localStorage each time, without triggering select()', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const result = makeResult({ id: 'r-1' });
      const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() } as unknown as Event;

      component.toggleFavorite(result, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isFavorite(result)).toBe(true);
      expect(component.selected()).toBeNull(); // the card's own click-to-preview must not also fire
      expect(JSON.parse(localStorage.getItem('pdf-search-favorites')!)).toHaveLength(1);

      component.toggleFavorite(result, event);
      expect(component.isFavorite(result)).toBe(false);
      expect(JSON.parse(localStorage.getItem('pdf-search-favorites')!)).toHaveLength(0);
    });
  });

  describe('saveToLibrary', () => {
    /** Lascia sfilare le promise incatenate dentro il subscribe di saveToLibrary. */
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('scarica il PDF e lo archivia con i metadati del risultato', async () => {
      configure();
      downloadBlobMock.mockReturnValue(of(new Blob([new Uint8Array(4)], { type: 'application/pdf' })));
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const result = makeResult({ id: 'ia-x', title: 'Un Libro', author: 'Autore', year: '1900' });

      fixture.componentInstance.saveToLibrary(result);
      await flush();

      expect(downloadBlobMock).toHaveBeenCalledWith(result);
      const [meta, blob] = libraryMock.add.mock.calls[0];
      expect(meta).toMatchObject({ id: 'ia-x', title: 'Un Libro', author: 'Autore', year: '1900', source: 'internet_archive' });
      expect(blob.size).toBe(4);
    });

    it('indicizza subito il testo, così il documento è cercabile senza altri passaggi', async () => {
      configure();
      downloadBlobMock.mockReturnValue(of(new Blob([new Uint8Array(4)], { type: 'application/pdf' })));
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      fixture.componentInstance.saveToLibrary(makeResult({ id: 'ia-x' }));
      await flush();

      expect(pdfjsMock.extractPages).toHaveBeenCalled();
      expect(libraryMock.indexPages).toHaveBeenCalledWith('ia-x', [{ page: 1, text: 'testo' }]);
    });

    it('segnala il salvataggio riuscito e sblocca il bottone', async () => {
      configure();
      downloadBlobMock.mockReturnValue(of(new Blob([new Uint8Array(4)], { type: 'application/pdf' })));
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.saveToLibrary(makeResult());
      await flush();

      expect(component.justSaved()).toBe(true);
      expect(component.savingToLibrary()).toBe(false);
      expect(component.error()).toBe('');
    });

    it('un documento resta in libreria anche se l indicizzazione fallisce', async () => {
      configure();
      downloadBlobMock.mockReturnValue(of(new Blob([new Uint8Array(4)], { type: 'application/pdf' })));
      pdfjsMock.openDocument.mockRejectedValue(new Error('pdf corrotto'));
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.saveToLibrary(makeResult());
      await flush();

      expect(libraryMock.add).toHaveBeenCalled();
      expect(component.justSaved()).toBe(true);
      expect(component.error()).toBe('');
    });

    it('mostra un errore se il download non riesce', async () => {
      configure();
      downloadBlobMock.mockReturnValue(throwError(() => new Error('rete')));
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.saveToLibrary(makeResult());
      await flush();

      expect(component.error()).toContain('libreria');
      expect(component.savingToLibrary()).toBe(false);
      expect(libraryMock.add).not.toHaveBeenCalled();
    });

    it('isInLibrary riflette lo stato della libreria', () => {
      configure();
      libraryMock.has.mockReturnValue(true);
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      expect(fixture.componentInstance.isInLibrary(makeResult({ id: 'ia-x' }))).toBe(true);
      expect(libraryMock.has).toHaveBeenCalledWith('ia-x');
    });

    it('carica la libreria all avvio per sapere cosa è già salvato', () => {
      configure();
      const fixture = TestBed.createComponent(PdfSearchComponent);
      fixture.detectChanges();

      expect(libraryMock.refresh).toHaveBeenCalled();
    });
  });
});
