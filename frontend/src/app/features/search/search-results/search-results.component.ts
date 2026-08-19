import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { finalize } from 'rxjs';
import { SearchHit, SearchHitType, SearchService } from '../../../core/services/search.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, MatIconModule],
  templateUrl: './search-results.component.html',
  styleUrls: ['./search-results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultsComponent implements OnInit {
  query = '';
  activeType: SearchHitType | null = null;
  results: SearchHit[] = [];
  total = 0;
  page = 1;
  totalPages = 1;
  loading = true;

  private readonly limit = 10;
  private readonly langService = inject(LanguageService);
  readonly currentLang = this.langService.current;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private searchSvc: SearchService,
    private seo: SeoService,
    private cdr: ChangeDetectorRef,
  ) {
    // Re-render when UI language changes (OnPush requires explicit trigger)
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.query = params.get('q') ?? '';
      this.activeType = (params.get('type') as SearchHitType | null) ?? null;
      this.page = Number(params.get('page')) || 1;
      this.seo.update({
        title: this.query ? `${this.query} — Search` : 'Search',
        description: 'Search results across blog posts and projects.',
        url: `${SITE_ORIGIN}${withLangPrefix('/search', this.currentLang())}`,
      });
      this.runSearch();
    });
  }

  private runSearch(): void {
    if (this.query.trim().length < 2) {
      this.results = [];
      this.total = 0;
      this.totalPages = 1;
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.searchSvc
      .search(this.query, {
        lang: this.currentLang(),
        type: this.activeType ?? undefined,
        page: this.page,
        limit: this.limit,
      })
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: res => {
          this.results = res.data;
          this.total = res.total;
          this.totalPages = res.totalPages;
          this.cdr.markForCheck();
        },
        error: () => {
          this.results = [];
          this.total = 0;
          this.totalPages = 1;
        },
      });
  }

  setType(type: SearchHitType | null): void {
    this.activeType = type;
    this.navigate({ page: 1 });
  }

  goToPage(page: number): void {
    this.navigate({ page });
  }

  hitLink(hit: SearchHit): string {
    return withLangPrefix(hit.url, this.currentLang());
  }

  private navigate(overrides: { page?: number }): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.query, type: this.activeType ?? null, page: overrides.page ?? this.page },
      queryParamsHandling: 'merge',
    });
  }
}
