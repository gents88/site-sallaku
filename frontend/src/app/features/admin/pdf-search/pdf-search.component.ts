import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, HostListener, PLATFORM_ID, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, of, switchMap, catchError } from 'rxjs';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { PdfSearchService, PdfSearchResult, PdfSource } from '../../../core/services/pdf-search.service';
import { LibraryService } from '../../../core/services/library.service';

const MOBILE_QUERY = '(max-width: 640px)';
const BOOK_SOURCES: PdfSource[] = ['internet_archive', 'gutenberg'];
const PAPER_SOURCES: PdfSource[] = ['arxiv', 'pmc'];
const RECENT_SEARCHES_KEY = 'pdf-search-recent-queries';
const MAX_RECENT_SEARCHES = 8;
const FAVORITES_KEY = 'pdf-search-favorites';
const MAX_FAVORITES = 100;
// Typical library scanning runs 300-600 ppi; below ~150 is usually a rough
// phone/camera capture rather than a proper scan. Anything in between is
// unremarkable — no badge, to keep the signal meaningful.
const HD_SCAN_PPI = 300;
const LOW_SCAN_PPI = 150;

export type SourceFilter = 'all' | 'books' | 'papers';
export type SortOrder = 'relevance' | 'year_desc' | 'year_asc';
export type ScanQuality = 'hd' | 'low' | null;
export type DisplayResult = PdfSearchResult & { duplicateCount: number };

/** Lowercase, strip diacritics/punctuation, collapse whitespace — good enough to catch "Alice's Adventures in Wonderland!" vs "alice s adventures in wonderland" as the same work. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

@Component({
  selector: 'app-pdf-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './pdf-search.component.html',
  styleUrls: ['./pdf-search.component.scss'],
})
export class PdfSearchComponent implements OnInit, OnDestroy {
  private readonly service = inject(PdfSearchService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly pdfjs = inject(PdfjsService);
  private readonly library = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loading = this.service.isLoading;

  readonly query = signal('');
  readonly results = signal<PdfSearchResult[]>([]);
  readonly error = signal('');
  readonly hasSearched = signal(false);
  readonly selected = signal<PdfSearchResult | null>(null);

  readonly sourceFilter = signal<SourceFilter>('all');
  readonly sortBy = signal<SortOrder>('relevance');
  // Internet Archive in particular often has 3-5 near-identical scans of the
  // same public-domain classic, uploaded independently by different people —
  // grouping by normalized title keeps the grid from being dominated by one
  // popular title's many editions.
  readonly groupSimilar = signal(true);

  readonly displayResults = computed<DisplayResult[]>(() => {
    const filter = this.sourceFilter();
    let list = this.results();
    if (filter === 'books') list = list.filter((r) => BOOK_SOURCES.includes(r.source));
    else if (filter === 'papers') list = list.filter((r) => PAPER_SOURCES.includes(r.source));

    const sort = this.sortBy();
    if (sort !== 'relevance') {
      list = [...list].sort((a, b) => {
        const ay = parseInt(a.year, 10) || 0;
        const by = parseInt(b.year, 10) || 0;
        return sort === 'year_desc' ? by - ay : ay - by;
      });
    }

    if (!this.groupSimilar()) return list.map((r) => ({ ...r, duplicateCount: 1 }));

    const byTitle = new Map<string, DisplayResult>();
    for (const r of list) {
      const key = normalizeTitle(r.title);
      const existing = byTitle.get(key);
      if (existing) existing.duplicateCount++;
      else byTitle.set(key, { ...r, duplicateCount: 1 });
    }
    return [...byTitle.values()];
  });

  readonly skeletonPlaceholders = Array.from({ length: 8 });

  readonly features = [
    { icon: '⚖️', titleKey: 'pdf_search.feature_legal_title', descKey: 'pdf_search.feature_legal_desc' },
    { icon: '📚', titleKey: 'pdf_search.feature_sources_title', descKey: 'pdf_search.feature_sources_desc' },
    { icon: '👁️', titleKey: 'pdf_search.feature_preview_title', descKey: 'pdf_search.feature_preview_desc' },
  ];

  readonly faqs = [
    { qKey: 'pdf_search.faq_q1', aKey: 'pdf_search.faq_a1' },
    { qKey: 'pdf_search.faq_q2', aKey: 'pdf_search.faq_a2' },
    { qKey: 'pdf_search.faq_q3', aKey: 'pdf_search.faq_a3' },
    { qKey: 'pdf_search.faq_q4', aKey: 'pdf_search.faq_a4' },
    { qKey: 'pdf_search.faq_q5', aKey: 'pdf_search.faq_a5' },
    { qKey: 'pdf_search.faq_q6', aKey: 'pdf_search.faq_a6' },
  ];

  readonly recentSearches = signal<string[]>([]);
  readonly favorites = signal<PdfSearchResult[]>([]);

  // ── Preview: iframe path (desktop, source allows framing) ──────────────────
  private _previewBlobUrl: string | null = null;
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewLoading = signal(false);

  // ── Preview: pdf.js canvas path — used whenever the iframe path can't work:
  // mobile (native in-iframe PDF viewers commonly render only the first page)
  // or a source that blocks framing outright (PMC sends X-Frame-Options: DENY).
  // Neither restriction applies to fetching raw bytes and rendering them
  // ourselves, so this reuses the same proxy download the Workspace button
  // already relies on. Desktop keeps the iframe for previewable sources —
  // it streams natively from the source with no backend round-trip, which
  // matters for the largest archive.org scans.
  private pdfDoc: PdfDocument | null = null;
  private _pdfPageObjectUrl: string | null = null;
  readonly canvasPageUrl = signal<string | null>(null);
  readonly canvasPageNum = signal(1);
  readonly canvasNumPages = signal(0);
  readonly canvasViewerLoading = signal(false);
  readonly canvasViewerFailed = signal(false);

  readonly useCanvasViewer = computed(() => {
    const sel = this.selected();
    return !!sel && (this.isMobile() || !sel.previewable);
  });

  readonly sendingToWorkspace = signal(false);
  readonly justSent = signal(false);

  readonly savingToLibrary = signal(false);
  readonly justSaved = signal(false);

  private mobileQuery: MediaQueryList | null = null;
  private readonly onMobileQueryChange = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);
  readonly isMobile = signal(false);

  // Search only fires on an explicit trigger (submit button / Enter / a saved
  // recent search) — no search-as-you-type, to avoid hammering the external
  // APIs (and their rate limits) on every keystroke. switchMap still cancels
  // a slow earlier request if a newer one comes in. catchError lives inside
  // the inner pipe: letting it escape would kill the whole subscription on
  // the first failed search.
  private readonly searchTrigger$ = new Subject<string>();

  constructor() {
    this.searchTrigger$
      .pipe(
        switchMap((q) =>
          this.service.search(q).pipe(
            catchError((err) => {
              const msg = err?.error?.message ?? 'La ricerca non è riuscita. Riprova.';
              this.error.set(msg);
              this.results.set([]);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((results) => {
        if (results === null) return;
        this.error.set('');
        this.results.set(results);
      });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.mobileQuery = window.matchMedia(MOBILE_QUERY);
      this.isMobile.set(this.mobileQuery.matches);
      this.mobileQuery.addEventListener('change', this.onMobileQueryChange);
      this.loadRecentSearches();
      this.loadFavorites();
      // Serve a sapere quali risultati sono già in libreria, per mostrare "Salvato".
      void this.library.refresh();
    }

    // Read once, not a reactive subscription: runSearch() below writes this
    // same param back with replaceUrl, and staying subscribed would turn
    // every search into a read-then-write loop for no benefit.
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery && initialQuery.trim().length >= 2) {
      this.query.set(initialQuery);
      this.runSearch(initialQuery.trim());
    }

    this.seo.update({
      title: 'Motore di Ricerca PDF Pubblico Dominio — Libri Senza Copyright',
      description: 'Motore di ricerca PDF per trovare e scaricare libri di pubblico dominio, paper scientifici e articoli open access, senza problemi di copyright. Cerca su Internet Archive, Project Gutenberg, arXiv e PubMed Central con anteprima prima del download.',
      url: 'https://gentsallaku.it/lab/pdf-search',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Ricerca PDF',
        description: 'Motore di ricerca PDF di pubblico dominio, paper scientifici e articoli accademici open access su Internet Archive, Project Gutenberg, arXiv e PubMed Central, con anteprima integrata.',
        url: 'https://gentsallaku.it/lab/pdf-search',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      // FAQPage schema — eligible for expandable Q&A rich results in Google's
      // SERP, which raises click-through even without ranking #1. Kept in
      // Italian to match the rest of this component's JSON-LD (not localized
      // dynamically, same as the WebApplication block above).
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Come funziona questo motore di ricerca PDF?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Cerca contemporaneamente su Internet Archive, Project Gutenberg, arXiv e PubMed Central e mostra solo i risultati con un PDF realmente disponibile, con anteprima diretta nel browser prima di scaricare.',
            },
          },
          {
            '@type': 'Question',
            name: 'È legale scaricare questi PDF?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sì. Ogni fonte indicizzata pubblica solo materiale di pubblico dominio o open access: libri con diritti scaduti, paper scientifici e articoli con licenza di distribuzione libera. Nessun contenuto piratato.',
            },
          },
          {
            '@type': 'Question',
            name: 'Quali fonti copre la ricerca PDF senza copyright?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Internet Archive e Project Gutenberg per libri e classici di pubblico dominio, arXiv e PubMed Central per paper scientifici e articoli accademici open access.',
            },
          },
          {
            '@type': 'Question',
            name: 'Posso cercare libri PDF di pubblico dominio in italiano?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sì, Internet Archive include molte scansioni di libri italiani di pubblico dominio, oltre al catalogo prevalentemente in inglese di Project Gutenberg.',
            },
          },
          {
            '@type': 'Question',
            name: 'Perché alcuni risultati non hanno l’anteprima?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Alcune fonti (es. PubMed Central) impediscono l’incorporazione diretta della pagina per motivi tecnici del loro server — in quel caso il download resta comunque disponibile.',
            },
          },
          {
            '@type': 'Question',
            name: 'Il motore di ricerca PDF è gratuito?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sì, completamente gratuito, senza registrazione né limiti di utilizzo, salvo un limite tecnico anti-abuso di 20 ricerche al minuto.',
            },
          },
        ],
      },
    ]);
  }

  ngOnDestroy(): void {
    this.mobileQuery?.removeEventListener('change', this.onMobileQueryChange);
    this._revokePreview();
    this._revokeCanvasPage();
  }

  private _revokePreview(): void {
    // pdfUrl points at the external source, not a local blob — nothing to revoke,
    // just clear the sanitized reference so a stale iframe never lingers.
    this._previewBlobUrl = null;
    this.previewUrl.set(null);
  }

  private _revokeCanvasPage(): void {
    if (this._pdfPageObjectUrl) { URL.revokeObjectURL(this._pdfPageObjectUrl); this._pdfPageObjectUrl = null; }
    this.canvasPageUrl.set(null);
  }

  // ── Recent searches (localStorage) ──────────────────────────────────────
  private loadRecentSearches(): void {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      this.recentSearches.set(raw ? JSON.parse(raw) : []);
    } catch {
      this.recentSearches.set([]);
    }
  }

  private saveRecentSearch(q: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const withoutDupe = this.recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
    const updated = [q, ...withoutDupe].slice(0, MAX_RECENT_SEARCHES);
    this.recentSearches.set(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Storage full/unavailable (private browsing etc.) — recent searches just won't persist.
    }
  }

  useRecentSearch(q: string): void {
    this.query.set(q);
    this.runSearch(q);
  }

  clearRecentSearches(): void {
    this.recentSearches.set([]);
    if (isPlatformBrowser(this.platformId)) {
      try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* ignore */ }
    }
  }

  setGroupSimilar(value: boolean): void {
    this.groupSimilar.set(value);
    this.analytics.trackClick('pdf_search_group_similar', String(value));
  }

  // ── Favorites (localStorage) ────────────────────────────────────────────
  private loadFavorites(): void {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      this.favorites.set(raw ? JSON.parse(raw) : []);
    } catch {
      this.favorites.set([]);
    }
  }

  private saveFavorites(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites()));
    } catch {
      // Storage full/unavailable (private browsing etc.) — favorites just won't persist.
    }
  }

  isFavorite(result: PdfSearchResult): boolean {
    return this.favorites().some((f) => f.id === result.id);
  }

  /**
   * stopPropagation is required — the star sits inside the result-card button
   * and must not also open the preview. preventDefault matters for the Space
   * key specifically: the star is a <span role="button"> (nesting a real
   * <button> inside result-card's own <button> is invalid HTML), so the
   * browser doesn't know to suppress its default page-scroll-on-Space.
   */
  toggleFavorite(result: PdfSearchResult, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const isFav = this.isFavorite(result);
    if (isFav) {
      this.favorites.set(this.favorites().filter((f) => f.id !== result.id));
    } else {
      this.favorites.set([result, ...this.favorites()].slice(0, MAX_FAVORITES));
    }
    this.saveFavorites();
    this.analytics.trackClick('pdf_search_favorite', isFav ? 'remove' : 'add', result.pdfUrl);
  }

  private runSearch(q: string): void {
    this.error.set('');
    this.hasSearched.set(true);
    this.selected.set(null);
    this._revokePreview();
    this.searchTrigger$.next(q);
    this.saveRecentSearch(q);

    this.analytics.trackClick('pdf_search_query', q);
    // replaceUrl: with live-as-you-type search, every settled keystroke would
    // otherwise push a new history entry — this keeps the URL shareable
    // without turning the back button into a keystroke-by-keystroke replay.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Only trigger: submit button / Enter. No search-as-you-type. */
  search(): void {
    const q = this.query().trim();
    if (q.length < 2) return;
    this.runSearch(q);
  }

  setFilter(filter: SourceFilter): void {
    this.sourceFilter.set(filter);
    this.analytics.trackClick('pdf_search_filter', filter);
  }

  setSortBy(sort: SortOrder): void {
    this.sortBy.set(sort);
    this.analytics.trackClick('pdf_search_sort', sort);
  }

  select(result: PdfSearchResult): void {
    this.analytics.trackClick('pdf_search_result_open', result.source, result.pdfUrl);
    this.selected.set(result);

    if (result.previewable && !this.isMobile()) {
      this.previewLoading.set(true);
      this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(result.pdfUrl));
    } else {
      this.loadCanvasPreview(result);
    }
  }

  onPreviewLoaded(): void {
    this.previewLoading.set(false);
  }

  /** Fetches the PDF via the same proxy Workspace uses and renders it page-by-page with pdf.js. */
  private loadCanvasPreview(result: PdfSearchResult): void {
    this.canvasViewerLoading.set(true);
    this.canvasViewerFailed.set(false);
    this._revokeCanvasPage();
    this.pdfDoc = null;
    this.canvasPageNum.set(1);
    this.canvasNumPages.set(0);

    this.service.downloadBlob(result).subscribe({
      next: async (blob) => {
        try {
          const buffer = await blob.arrayBuffer();
          this.pdfDoc = await this.pdfjs.openDocument(buffer);
          this.canvasNumPages.set(this.pdfDoc.numPages);
          await this.renderCanvasPage();
        } catch {
          this.canvasViewerFailed.set(true);
        } finally {
          this.canvasViewerLoading.set(false);
        }
      },
      error: () => {
        this.canvasViewerFailed.set(true);
        this.canvasViewerLoading.set(false);
      },
    });
  }

  private async renderCanvasPage(): Promise<void> {
    if (!this.pdfDoc) return;
    const page = await this.pdfDoc.getPage(this.canvasPageNum());
    const blob = await this.pdfjs.renderPageToBlob(page, 1.5);
    this._revokeCanvasPage();
    this._pdfPageObjectUrl = URL.createObjectURL(blob);
    this.canvasPageUrl.set(this._pdfPageObjectUrl);
  }

  nextCanvasPage(): void {
    if (this.canvasPageNum() >= this.canvasNumPages()) return;
    this.canvasPageNum.update((p) => p + 1);
    this.renderCanvasPage();
  }

  prevCanvasPage(): void {
    if (this.canvasPageNum() <= 1) return;
    this.canvasPageNum.update((p) => p - 1);
    this.renderCanvasPage();
  }

  closePreview(): void {
    this.selected.set(null);
    this.previewLoading.set(false);
    this._revokePreview();
    this.pdfDoc = null;
    this.canvasViewerFailed.set(false);
    this._revokeCanvasPage();
  }

  scanQuality(result: PdfSearchResult): ScanQuality {
    if (result.scanPpi === null) return null;
    if (result.scanPpi >= HD_SCAN_PPI) return 'hd';
    if (result.scanPpi < LOW_SCAN_PPI) return 'low';
    return null;
  }

  trackDownload(result: PdfSearchResult): void {
    this.analytics.trackClick('pdf_search_download', result.source, result.pdfUrl);
  }

  sendToWorkspace(result: PdfSearchResult): void {
    this.analytics.trackClick('pdf_search_workspace_send', result.source);
    this.sendingToWorkspace.set(true);
    this.service.downloadBlob(result).subscribe({
      next: (blob) => {
        this.workspace.send({
          kind: 'file',
          blob,
          filename: `${result.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80)}.pdf`,
          mime: 'application/pdf',
          fromTool: 'pdf_search',
        });
        this.sendingToWorkspace.set(false);
        this.justSent.set(true);
        setTimeout(() => this.justSent.set(false), 1500);
      },
      error: () => {
        this.sendingToWorkspace.set(false);
        this.error.set('Invio a Workspace non riuscito. Riprova.');
      },
    });
  }

  isInLibrary(result: PdfSearchResult): boolean {
    return this.library.has(result.id);
  }

  /**
   * Scarica il PDF e lo archivia nella Libreria locale (IndexedDB), poi ne
   * estrae il testo pagina per pagina così diventa subito cercabile e
   * interrogabile. L'indicizzazione non blocca il salvataggio: se fallisce,
   * il documento resta comunque in libreria e si potrà reindicizzare da lì.
   */
  saveToLibrary(result: PdfSearchResult): void {
    this.analytics.trackClick('pdf_search_library_save', result.source);
    this.savingToLibrary.set(true);
    this.service.downloadBlob(result).subscribe({
      next: async (blob) => {
        try {
          await this.library.add(
            {
              id: result.id,
              title: result.title,
              author: result.author,
              year: result.year,
              source: result.source,
              sourceLabel: result.sourceLabel,
              detailsUrl: result.detailsUrl,
              coverUrl: result.coverUrl,
            },
            blob,
          );
          await this.indexSavedDoc(result.id, blob);
          this.justSaved.set(true);
          setTimeout(() => this.justSaved.set(false), 2000);
        } catch {
          this.error.set('Salvataggio in libreria non riuscito. Riprova.');
        } finally {
          this.savingToLibrary.set(false);
        }
      },
      error: () => {
        this.savingToLibrary.set(false);
        this.error.set('Salvataggio in libreria non riuscito. Riprova.');
      },
    });
  }

  private async indexSavedDoc(id: string, blob: Blob): Promise<void> {
    try {
      const doc = await this.pdfjs.openDocument(await blob.arrayBuffer());
      const pages = await this.pdfjs.extractPages(doc);
      await this.library.indexPages(id, pages);
      await doc.loadingTask.destroy();
    } catch {
      // Documento salvato ma non indicizzato: la Libreria lo segnala e offre di riprovare.
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.selected()) this.closePreview();
  }
}
