import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef, HostListener, PLATFORM_ID, ViewChild, effect, signal, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, Subscription, of, switchMap, catchError, tap } from 'rxjs';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { PdfSearchService, PdfSearchResult, PdfSource } from '../../../core/services/pdf-search.service';
import { LibraryService } from '../../../core/services/library.service';
import { LabToolInfoComponent } from '../../../shared/components/lab-tool-info/lab-tool-info.component';

const MOBILE_QUERY = '(max-width: 640px)';
const BOOK_SOURCES: PdfSource[] = ['internet_archive', 'gutenberg', 'wikimedia'];
const PAPER_SOURCES: PdfSource[] = ['arxiv', 'pmc', 'zenodo'];
const RECENT_SEARCHES_KEY = 'pdf-search-recent-queries';
const MAX_RECENT_SEARCHES = 8;
const FAVORITES_KEY = 'pdf-search-favorites';
const MAX_FAVORITES = 100;
// Alcune fonti (es. sorgenti lente o che bloccano il framing in modo non
// esplicito) non emettono mai l'evento (load) dell'iframe: senza un limite
// di tempo lo spinner resterebbe visibile a tempo indefinito.
const PREVIEW_TIMEOUT_MS = 10000;
// Typical library scanning runs 300-600 ppi; below ~150 is usually a rough
// phone/camera capture rather than a proper scan. Anything in between is
// unremarkable — no badge, to keep the signal meaningful.
const HD_SCAN_PPI = 300;
const LOW_SCAN_PPI = 150;
// Ricerche già fatte in questa sessione: ripetere una query (o tornare a una
// recente) è istantaneo e non consuma il limite anti-abuso delle API.
const SEARCH_CACHE_MAX = 20;
// Pagine già rasterizzate nel viewer canvas: tornare indietro non deve
// rifare il rendering. Tetto basso perché ogni PNG a 1.5x pesa qualche MB.
const PAGE_CACHE_MAX = 6;
/** Spostamento orizzontale minimo (px) perché un tocco conti come swipe. */
const SWIPE_MIN_PX = 50;
/** Area massima (px) di una pagina rasterizzata: sotto i limiti dei canvas mobile, che oltre questa soglia restituiscono bianco. */
const MAX_PAGE_PIXELS = 8_000_000;
const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;
const DEFAULT_ZOOM_INDEX = 1;

export type SourceFilter = 'all' | 'books' | 'papers' | 'favorites';
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
  imports: [LabToolInfoComponent, CommonModule, FormsModule, TranslateModule, BreadcrumbComponent],
  templateUrl: './pdf-search.component.html',
  styleUrls: ['./pdf-search.component.scss'],
})
export class PdfSearchComponent implements OnInit, OnDestroy {
  private readonly service = inject(PdfSearchService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);
  private readonly langService = inject(LanguageService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly pdfjs = inject(PdfjsService);
  private readonly library = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);

  readonly loading = this.service.isLoading;

  breadcrumbItems: BreadcrumbItem[] = [];

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
    let list = filter === 'favorites' ? this.favorites() : this.results();
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

  /** Conteggi per i chip dei filtri: evitano il tentativo alla cieca ("Paper" è vuoto?). */
  readonly filterCounts = computed(() => {
    const list = this.results();
    return {
      all: list.length,
      books: list.filter((r) => BOOK_SOURCES.includes(r.source)).length,
      papers: list.filter((r) => PAPER_SOURCES.includes(r.source)).length,
    };
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
  readonly previewFailed = signal(false);
  private previewTimeoutId: ReturnType<typeof setTimeout> | undefined;

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
  readonly canvasPageRendering = signal(false);
  readonly zoomIndex = signal(DEFAULT_ZOOM_INDEX);
  readonly zoomPercent = computed(() => Math.round((ZOOM_LEVELS[this.zoomIndex()] / ZOOM_LEVELS[DEFAULT_ZOOM_INDEX]) * 100));
  readonly canZoomIn = computed(() => this.zoomIndex() < ZOOM_LEVELS.length - 1);
  readonly canZoomOut = computed(() => this.zoomIndex() > 0);
  /** Incrementato a ogni apertura/chiusura: scarta i risultati asincroni di una preview ormai obsoleta. */
  private previewToken = 0;
  private downloadSub: Subscription | null = null;
  private readonly pageCache = new Map<string, string>();
  readonly linkCopied = signal(false);

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

  // Cover thumbnails come straight from third-party services (archive.org,
  // Gutenberg) with no proxy — they occasionally time out or 404 under load.
  // Track failures so the template can fall back to the 📄 icon instead of
  // leaving a permanently broken <img>.
  readonly failedCovers = signal<ReadonlySet<string>>(new Set());

  coverFailed(id: string): boolean {
    return this.failedCovers().has(id);
  }

  onCoverError(id: string): void {
    if (this.failedCovers().has(id)) return;
    this.failedCovers.update((prev) => new Set(prev).add(id));
  }

  // Search only fires on an explicit trigger (submit button / Enter / a saved
  // recent search) — no search-as-you-type, to avoid hammering the external
  // APIs (and their rate limits) on every keystroke. switchMap still cancels
  // a slow earlier request if a newer one comes in. catchError lives inside
  // the inner pipe: letting it escape would kill the whole subscription on
  // the first failed search.
  private readonly searchTrigger$ = new Subject<string>();

  @ViewChild('previewCloseBtn') private previewCloseBtnRef?: ElementRef<HTMLButtonElement>;

  constructor() {
    effect(() => {
      if (this.selected()) {
        setTimeout(() => this.previewCloseBtnRef?.nativeElement.focus(), 0);
      }
    });

    this.searchTrigger$
      .pipe(
        switchMap((q) =>
          this.searchCache(q).pipe(
            catchError((err) => {
              const rawMsg = err?.error?.message;
              const msg = Array.isArray(rawMsg) ? rawMsg.join(' ') : rawMsg || this.translate.instant('pdf_search.err_search');
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
        // Se il filtro attivo resterebbe vuoto (es. "Paper" su una query di soli libri) si torna a "Tutti".
        if (this.sourceFilter() !== 'all' && this.sourceFilter() !== 'favorites' && this.displayResults().length === 0) {
          this.sourceFilter.set('all');
        }
      });
  }

  private readonly resultsCache = new Map<string, PdfSearchResult[]>();

  private searchCache(q: string) {
    const key = q.trim().toLowerCase();
    const hit = this.resultsCache.get(key);
    if (hit) return of(hit);
    return this.service.search(q).pipe(
      tap((res) => {
        if (res.length === 0) return;
        this.resultsCache.set(key, res);
        if (this.resultsCache.size > SEARCH_CACHE_MAX) {
          this.resultsCache.delete(this.resultsCache.keys().next().value as string);
        }
      }),
    );
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
      title: this.translate.instant('pdf_search.seo_title'),
      description: this.translate.instant('pdf_search.seo_description'),
      url: `${SITE_ORIGIN}${withLangPrefix('/lab/pdf-search', this.langService.current())}`,
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
      this.seo.breadcrumb([
        { name: this.translate.instant('nav.home'), url: 'https://gentsallaku.it/' },
        { name: this.translate.instant('sidebar.lab'), url: 'https://gentsallaku.it/lab' },
        { name: this.translate.instant('sidebar.items.pdf_search'), url: 'https://gentsallaku.it/lab/pdf-search' },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: this.translate.instant('nav.home'), path: '/' },
      { label: this.translate.instant('sidebar.lab'), path: '/lab' },
      { label: this.translate.instant('sidebar.items.pdf_search') },
    ];
  }

  ngOnDestroy(): void {
    this.mobileQuery?.removeEventListener('change', this.onMobileQueryChange);
    this._revokePreview();
    this.disposeCanvasViewer();
  }

  private _revokePreview(): void {
    // pdfUrl points at the external source, not a local blob — nothing to revoke,
    // just clear the sanitized reference so a stale iframe never lingers.
    this._previewBlobUrl = null;
    this.previewUrl.set(null);
    this.previewFailed.set(false);
    this.clearPreviewTimeout();
  }

  private clearPreviewTimeout(): void {
    if (this.previewTimeoutId) {
      clearTimeout(this.previewTimeoutId);
      this.previewTimeoutId = undefined;
    }
  }

  private _revokeCanvasPage(): void {
    this._pdfPageObjectUrl = null;
    this.canvasPageUrl.set(null);
  }

  /** Libera download in corso, documento pdf.js (worker incluso) e tutte le pagine in cache. */
  private disposeCanvasViewer(): void {
    this.previewToken++;
    this.downloadSub?.unsubscribe();
    this.downloadSub = null;
    for (const url of this.pageCache.values()) URL.revokeObjectURL(url);
    this.pageCache.clear();
    this._revokeCanvasPage();
    const doc = this.pdfDoc;
    this.pdfDoc = null;
    void doc?.loadingTask?.destroy?.();
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
      this.disposeCanvasViewer();
      this.canvasViewerLoading.set(false);
      this.previewLoading.set(true);
      this.previewFailed.set(false);
      this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(result.pdfUrl));
      this.clearPreviewTimeout();
      this.previewTimeoutId = setTimeout(() => {
        this.previewLoading.set(false);
        this.previewFailed.set(true);
      }, PREVIEW_TIMEOUT_MS);
    } else {
      this.loadCanvasPreview(result);
    }
  }

  onPreviewLoaded(): void {
    this.clearPreviewTimeout();
    this.previewLoading.set(false);
  }

  /** Fetches the PDF via the same proxy Workspace uses and renders it page-by-page with pdf.js. */
  private loadCanvasPreview(result: PdfSearchResult): void {
    this.disposeCanvasViewer();
    const token = this.previewToken;
    this.canvasViewerLoading.set(true);
    this.canvasViewerFailed.set(false);
    this.canvasPageNum.set(1);
    this.canvasNumPages.set(0);
    this.zoomIndex.set(DEFAULT_ZOOM_INDEX);

    this.downloadSub = this.service.downloadBlob(result).subscribe({
      next: async (blob) => {
        try {
          const buffer = await blob.arrayBuffer();
          const doc = await this.pdfjs.openDocument(buffer);
          // Nel frattempo l'utente ha chiuso la preview o aperto un altro risultato.
          if (token !== this.previewToken) { void doc.loadingTask?.destroy?.(); return; }
          this.pdfDoc = doc;
          this.canvasNumPages.set(doc.numPages);
          await this.renderCanvasPage();
        } catch {
          if (token === this.previewToken) this.canvasViewerFailed.set(true);
        } finally {
          if (token === this.previewToken) this.canvasViewerLoading.set(false);
        }
      },
      error: () => {
        if (token !== this.previewToken) return;
        this.canvasViewerFailed.set(true);
        this.canvasViewerLoading.set(false);
      },
    });
  }

  private async rasterPage(pageNum: number): Promise<string | null> {
    const doc = this.pdfDoc;
    if (!doc) return null;
    const scale = ZOOM_LEVELS[this.zoomIndex()];
    const key = `${scale}:${pageNum}`;
    const cached = this.pageCache.get(key);
    if (cached) {
      // Rinfresca la posizione LRU.
      this.pageCache.delete(key);
      this.pageCache.set(key, cached);
      return cached;
    }
    const token = this.previewToken;
    const page = await doc.getPage(pageNum);
    const blob = await this.pdfjs.renderPageToBlob(page, scale, { maxPixels: MAX_PAGE_PIXELS, retryIfBlank: true });
    page.cleanup?.();
    if (token !== this.previewToken) return null;
    const url = URL.createObjectURL(blob);
    this.pageCache.set(key, url);
    while (this.pageCache.size > PAGE_CACHE_MAX) {
      const oldest = this.pageCache.keys().next().value as string;
      const oldUrl = this.pageCache.get(oldest)!;
      if (oldUrl === this._pdfPageObjectUrl) break;
      URL.revokeObjectURL(oldUrl);
      this.pageCache.delete(oldest);
    }
    return url;
  }

  private async renderCanvasPage(): Promise<void> {
    const token = this.previewToken;
    const pageNum = this.canvasPageNum();
    this.canvasPageRendering.set(true);
    try {
      const url = await this.rasterPage(pageNum);
      // Click rapidi su ›: vince solo l'ultima pagina richiesta.
      if (!url || token !== this.previewToken || pageNum !== this.canvasPageNum()) return;
      this._pdfPageObjectUrl = url;
      this.canvasPageUrl.set(url);
      void this.prefetchPage(pageNum + 1);
    } finally {
      if (token === this.previewToken) this.canvasPageRendering.set(false);
    }
  }

  /** Pre-renderizza la pagina successiva a riposo, così "›" è istantaneo. */
  private async prefetchPage(pageNum: number): Promise<void> {
    if (pageNum > this.canvasNumPages()) return;
    try { await this.rasterPage(pageNum); } catch { /* best effort */ }
  }

  nextCanvasPage(): void {
    if (this.canvasPageNum() >= this.canvasNumPages()) return;
    this.canvasPageNum.update((p) => p + 1);
    void this.renderCanvasPage();
  }

  prevCanvasPage(): void {
    if (this.canvasPageNum() <= 1) return;
    this.canvasPageNum.update((p) => p - 1);
    void this.renderCanvasPage();
  }

  goToCanvasPage(value: string | number): void {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(Math.max(n, 1), this.canvasNumPages());
    if (clamped === this.canvasPageNum()) return;
    this.canvasPageNum.set(clamped);
    void this.renderCanvasPage();
  }

  zoomIn(): void {
    if (!this.canZoomIn()) return;
    this.zoomIndex.update((i) => i + 1);
    void this.renderCanvasPage();
  }

  zoomOut(): void {
    if (!this.canZoomOut()) return;
    this.zoomIndex.update((i) => i - 1);
    void this.renderCanvasPage();
  }

  /** Copia un link condivisibile alla ricerca corrente. */
  async copySearchLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const q = this.query().trim();
    const url = `${SITE_ORIGIN}${withLangPrefix('/lab/pdf-search', this.langService.current())}${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1800);
      this.analytics.trackClick('pdf_search_copy_link', q);
    } catch { /* clipboard non disponibile: nessun feedback fuorviante */ }
  }

  closePreview(): void {
    this.selected.set(null);
    this.previewLoading.set(false);
    this._revokePreview();
    this.canvasViewerFailed.set(false);
    this.canvasViewerLoading.set(false);
    this.disposeCanvasViewer();
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
        this.error.set(this.translate.instant('pdf_search.err_workspace_send'));
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
          this.error.set(this.translate.instant('pdf_search.err_library_save'));
        } finally {
          this.savingToLibrary.set(false);
        }
      },
      error: () => {
        this.savingToLibrary.set(false);
        this.error.set(this.translate.instant('pdf_search.err_library_save'));
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

  // ── Swipe sul viewer canvas (touch): scorri a sinistra = pagina successiva, a destra = precedente ──
  private swipeStart: { x: number; y: number } | null = null;

  onSwipeStart(e: TouchEvent): void {
    // Più dita = pinch/zoom del browser, non un cambio pagina.
    this.swipeStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }

  onSwipeEnd(e: TouchEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || e.changedTouches.length !== 1) return;
    // Con zoom oltre il 100% il gesto orizzontale serve a spostarsi dentro la pagina.
    if (this.zoomIndex() > DEFAULT_ZOOM_INDEX) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Soglia minima e prevalenza dell'asse orizzontale: lo scroll verticale della pagina non deve cambiare pagina.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.nextCanvasPage(); else this.prevCanvasPage();
  }

  /** ←/→ sfogliano le pagine del viewer canvas (se non si sta scrivendo in un campo). */
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.selected() || !this.useCanvasViewer() || this.canvasNumPages() === 0) return;
    const t = event.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); this.nextCanvasPage(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); this.prevCanvasPage(); }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.selected()) this.closePreview();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro la preview finché è aperta. */
  onPreviewTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const modal = ke.currentTarget as HTMLElement;
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }
}
