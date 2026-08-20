import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, HostListener, PLATFORM_ID, signal, computed, inject } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, of, debounceTime, distinctUntilChanged, map, switchMap, catchError } from 'rxjs';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { PdfSearchService, PdfSearchResult, PdfSource } from '../../../core/services/pdf-search.service';

const MOBILE_QUERY = '(max-width: 640px)';
const SEARCH_DEBOUNCE_MS = 500;
const BOOK_SOURCES: PdfSource[] = ['internet_archive', 'gutenberg'];
const PAPER_SOURCES: PdfSource[] = ['arxiv', 'pmc'];

export type SourceFilter = 'all' | 'books' | 'papers';
export type SortOrder = 'relevance' | 'year_desc' | 'year_asc';

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

  readonly displayResults = computed(() => {
    const filter = this.sourceFilter();
    let list = this.results();
    if (filter === 'books') list = list.filter((r) => BOOK_SOURCES.includes(r.source));
    else if (filter === 'papers') list = list.filter((r) => PAPER_SOURCES.includes(r.source));

    const sort = this.sortBy();
    if (sort === 'relevance') return list;
    return [...list].sort((a, b) => {
      const ay = parseInt(a.year, 10) || 0;
      const by = parseInt(b.year, 10) || 0;
      return sort === 'year_desc' ? by - ay : ay - by;
    });
  });

  readonly skeletonPlaceholders = Array.from({ length: 8 });

  readonly features = [
    { icon: '⚖️', titleKey: 'pdf_search.feature_legal_title', descKey: 'pdf_search.feature_legal_desc' },
    { icon: '📚', titleKey: 'pdf_search.feature_sources_title', descKey: 'pdf_search.feature_sources_desc' },
    { icon: '👁️', titleKey: 'pdf_search.feature_preview_title', descKey: 'pdf_search.feature_preview_desc' },
  ];

  private _previewBlobUrl: string | null = null;
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewLoading = signal(false);

  readonly sendingToWorkspace = signal(false);
  readonly justSent = signal(false);

  // Mobile browsers' native PDF viewer inside an <iframe> commonly renders
  // only the first page instead of the full scrollable document — a browser
  // limitation, not something CSS can fix — so on narrow viewports the
  // preview modal skips the iframe entirely and points at the download
  // button instead, which opens the PDF in the phone's own full viewer.
  private mobileQuery: MediaQueryList | null = null;
  private readonly onMobileQueryChange = (e: MediaQueryListEvent) => this.isMobile.set(e.matches);
  readonly isMobile = signal(false);

  // Single pipeline for every trigger (typing, Enter, button click) so a
  // slow earlier response can never overwrite a newer one — switchMap cancels
  // it. catchError lives inside the inner pipe: letting it escape would kill
  // the whole subscription on the first failed search.
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

    toObservable(this.query)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((q) => q.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q.length === 0) {
          this.hasSearched.set(false);
          this.results.set([]);
          this.error.set('');
          return;
        }
        if (q.length < 2) return;
        this.runSearch(q);
      });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.mobileQuery = window.matchMedia(MOBILE_QUERY);
      this.isMobile.set(this.mobileQuery.matches);
      this.mobileQuery.addEventListener('change', this.onMobileQueryChange);
    }

    // Read once, not a reactive subscription: runSearch() below writes this
    // same param back with replaceUrl, and staying subscribed would turn
    // every search into a read-then-write loop for no benefit — the debounced
    // typing pipeline is already the single source of truth after this point.
    const initialQuery = this.route.snapshot.queryParamMap.get('q');
    if (initialQuery && initialQuery.trim().length >= 2) {
      this.query.set(initialQuery);
      this.runSearch(initialQuery.trim());
    }

    this.seo.update({
      title: 'Ricerca PDF Pubblico Dominio — Libri e Documenti Legali',
      description: 'Cerca PDF gratuiti e legali tra milioni di libri di pubblico dominio, paper scientifici e articoli accademici open access su Internet Archive, Project Gutenberg, arXiv e PubMed Central, con anteprima prima del download.',
      url: 'https://gentsallaku.it/lab/pdf-search',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Ricerca PDF',
      description: 'Ricerca di PDF di pubblico dominio, paper scientifici e articoli accademici open access su Internet Archive, Project Gutenberg, arXiv e PubMed Central, con anteprima integrata.',
      url: 'https://gentsallaku.it/lab/pdf-search',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void {
    this.mobileQuery?.removeEventListener('change', this.onMobileQueryChange);
    this._revokePreview();
  }

  private _revokePreview(): void {
    // pdfUrl points at the external source, not a local blob — nothing to revoke,
    // just clear the sanitized reference so a stale iframe never lingers.
    this._previewBlobUrl = null;
    this.previewUrl.set(null);
  }

  private runSearch(q: string): void {
    this.error.set('');
    this.hasSearched.set(true);
    this.selected.set(null);
    this._revokePreview();
    this.searchTrigger$.next(q);

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

  /** Explicit trigger (submit button / Enter) — the debounced live-typing search above covers the rest. */
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
      // Either the source blocks iframe embedding outright (e.g. PMC sends
      // X-Frame-Options: DENY), or we're on a narrow viewport where mobile
      // browsers' native PDF viewer inside an iframe typically renders only
      // the first page — neither case is worth loading an iframe for.
      this.previewLoading.set(false);
      this.previewUrl.set(null);
    }
  }

  onPreviewLoaded(): void {
    this.previewLoading.set(false);
  }

  closePreview(): void {
    this.selected.set(null);
    this.previewLoading.set(false);
    this._revokePreview();
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

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.selected()) this.closePreview();
  }
}
