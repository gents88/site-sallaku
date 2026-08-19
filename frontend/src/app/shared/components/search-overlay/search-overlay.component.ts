import { Component, ElementRef, HostListener, ViewChild, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { SearchHit, SearchService } from '../../../core/services/search.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (overlay.open()) {
      <div class="so-backdrop" (click)="close()"></div>
      <div class="so-panel" role="dialog" aria-modal="true" [attr.aria-label]="'search.dialog_label' | translate">
        <form class="so-input-row" (submit)="viewAll(); $event.preventDefault()">
          <span class="so-input-icon">🔎</span>
          <input
            #input
            type="text"
            class="so-input"
            [placeholder]="'search.placeholder' | translate"
            [value]="query()"
            (input)="onQuery($event)"
            (keydown.arrowdown)="move(1); $event.preventDefault()"
            (keydown.arrowup)="move(-1); $event.preventDefault()"
            (keydown.enter)="onEnter(); $event.preventDefault()"
          />
          <kbd class="so-esc">Esc</kbd>
        </form>
        <p class="so-close-hint">{{ 'search.tap_outside_close' | translate }}</p>

        @if (query().trim().length > 0 && query().trim().length < minLength) {
          <div class="so-hint">{{ 'search.min_chars' | translate: { count: minLength } }}</div>
        } @else if (loading()) {
          <div class="so-hint">{{ 'search.loading' | translate }}</div>
        } @else if (results().length) {
          <ul class="so-list">
            @for (hit of results(); track hit.id; let i = $index) {
              <li>
                <button
                  type="button"
                  class="so-item"
                  [class.active]="i === activeIndex()"
                  (mouseenter)="activeIndex.set(i)"
                  (click)="select(i)"
                >
                  <span class="so-item-icon">{{ hit.type === 'post' ? '📝' : '💼' }}</span>
                  <span class="so-item-body">
                    <span class="so-item-title">{{ hit.title }}</span>
                    <span class="so-item-excerpt">{{ hit.excerpt }}</span>
                  </span>
                  <span class="so-item-type">{{ ('search.filters.' + hit.type) | translate }}</span>
                </button>
              </li>
            }
          </ul>
          <button type="button" class="so-view-all" (click)="viewAll()">
            {{ 'search.view_all' | translate }}
          </button>
        } @else if (query().trim().length >= minLength) {
          <div class="so-empty">{{ 'search.no_results' | translate }}</div>
        }
      </div>
    }
  `,
  styles: [`
    .so-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      z-index: 900; backdrop-filter: blur(2px);
    }
    .so-panel {
      position: fixed; top: 14vh; left: 50%; transform: translateX(-50%);
      width: min(560px, 92vw); max-height: 68vh;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.45);
      z-index: 901; overflow: hidden; display: flex; flex-direction: column;
    }
    .so-input-row {
      display: flex; align-items: center; gap: .6rem;
      padding: .9rem 1.1rem; border-bottom: 1px solid var(--border-color, #30363d);
    }
    .so-input-icon { font-size: .95rem; opacity: .7; }
    .so-input {
      flex: 1; background: transparent; border: none; outline: none;
      color: var(--text-primary, #e6edf3); font-size: .95rem;
    }
    .so-esc {
      font-size: .68rem; color: var(--text-muted, #6e7681);
      border: 1px solid var(--border-color, #30363d); border-radius: 5px;
      padding: .1rem .4rem;
    }
    .so-close-hint {
      display: none;
      margin: 0; padding: .5rem 1.1rem 0;
      font-size: .74rem; color: var(--text-secondary, #8b949e); text-align: center;
    }
    @media (max-width: 600px) {
      .so-esc { display: none; }
      .so-close-hint { display: block; }
    }
    .so-list { list-style: none; margin: 0; padding: .4rem; overflow-y: auto; }
    .so-item {
      display: flex; align-items: center; gap: .7rem; width: 100%;
      padding: .55rem .7rem; border-radius: 9px; border: none;
      background: transparent; color: var(--text-primary, #e6edf3);
      text-align: left; cursor: pointer; font-size: .88rem;
      &.active, &:hover { background: rgba(108,99,255,.12); }
    }
    .so-item-icon { flex-shrink: 0; }
    .so-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .1rem; }
    .so-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .so-item-excerpt {
      font-size: .76rem; color: var(--text-secondary, #8b949e);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .so-item-type { font-size: .72rem; color: var(--text-secondary, #8b949e); flex-shrink: 0; }
    .so-hint, .so-empty {
      padding: 1.5rem; text-align: center; color: var(--text-secondary, #8b949e); font-size: .85rem;
    }
    .so-view-all {
      margin: 0 .4rem .4rem; padding: .6rem; border-radius: 9px; border: none;
      background: rgba(108,99,255,.12); color: var(--text-primary, #e6edf3);
      font-size: .85rem; font-weight: 600; cursor: pointer;
      &:hover { background: rgba(108,99,255,.2); }
    }
  `],
})
export class SearchOverlayComponent {
  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  readonly overlay = inject(SearchOverlayService);
  private readonly router = inject(Router);
  private readonly searchSvc = inject(SearchService);
  private readonly langSvc = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly analytics = inject(AnalyticsTrackingService);

  readonly minLength = MIN_QUERY_LENGTH;
  readonly query = signal('');
  readonly results = signal<SearchHit[]>([]);
  readonly loading = signal(false);
  readonly activeIndex = signal(0);

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap(q => {
          if (q.trim().length < MIN_QUERY_LENGTH) {
            this.loading.set(false);
            return of<SearchHit[]>([]);
          }
          this.loading.set(true);
          return this.searchSvc.suggest(q.trim(), this.langSvc.current()).pipe(
            catchError(() => of<SearchHit[]>([])),
          );
        }),
      )
      .subscribe(hits => {
        this.loading.set(false);
        this.results.set(hits);
        this.activeIndex.set(0);
      });

    effect(() => {
      if (this.overlay.open()) {
        this.query.set('');
        this.results.set([]);
        this.activeIndex.set(0);
        this.analytics.trackClick('search', 'search_overlay_open');
        queueMicrotask(() => this.inputRef?.nativeElement?.focus());
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.overlay.open()) {
      this.close();
      return;
    }
    if (this.overlay.open() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== '/') return;

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

    event.preventDefault();
    this.overlay.show();
  }

  onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.query$.next(value);
  }

  move(delta: number): void {
    const len = this.results().length;
    if (!len) return;
    this.activeIndex.update(i => (i + delta + len) % len);
  }

  onEnter(): void {
    if (this.results().length) this.select(this.activeIndex());
    else this.viewAll();
  }

  select(index: number): void {
    const hit = this.results()[index];
    if (!hit) return;
    this.analytics.trackClick('search', 'search_overlay_navigate', hit.url);
    this.router.navigateByUrl(withLangPrefix(hit.url, this.langSvc.current()));
    this.close();
  }

  viewAll(): void {
    const q = this.query().trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    this.analytics.trackClick('search', 'search_overlay_view_all', q);
    this.router.navigate([withLangPrefix('/search', this.langSvc.current())], { queryParams: { q } });
    this.close();
  }

  close(): void {
    this.overlay.close();
  }
}
