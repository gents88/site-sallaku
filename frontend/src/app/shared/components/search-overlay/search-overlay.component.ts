import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SearchHit, SearchService } from '../../../core/services/search.service';
import { LanguageService, SUPPORTED_LANGS, withLangPrefix } from '../../../core/services/language.service';
import { LanguageSwitchService } from '../../../core/services/language-switch.service';
import { InstallPromptService } from '../../../core/services/install-prompt.service';
import { SnackbarService } from '../../../core/services/snackbar.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NAV_REGISTRY, NavEntry } from '../../../core/navigation/nav-registry';
import { NavIconComponent, navIconColor } from '../nav-icon/nav-icon.component';
import { PaletteItem, PaletteSection, filterLocal, mergeSections } from './palette-items';

const MIN_REMOTE_QUERY = 2;
const DEBOUNCE_MS = 250;
const MAX_IDLE_PAGES = 8;

/**
 * Palette unica (Ctrl/Cmd+K, "/" o la lente in navbar): azioni, pagine e
 * contenuti in un solo posto. Prima c'erano due overlay separati — Ctrl+K
 * solo per la navigazione, "/" solo per i contenuti — con indici delle
 * pagine duplicati e già disallineati.
 */
@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [TranslateModule, NavIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-overlay.component.html',
  styleUrl: './search-overlay.component.scss',
})
export class SearchOverlayComponent {
  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  readonly overlay = inject(SearchOverlayService);
  private readonly router = inject(Router);
  private readonly searchSvc = inject(SearchService);
  private readonly langSvc = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly langSwitch = inject(LanguageSwitchService);
  private readonly installPrompt = inject(InstallPromptService);
  private readonly snackbar = inject(SnackbarService);

  readonly query = signal('');
  readonly remote = signal<SearchHit[]>([]);
  readonly loading = signal(false);
  readonly activeIndex = signal(0);
  readonly minRemote = MIN_REMOTE_QUERY;
  readonly iconColor = navIconColor;

  private readonly isAdmin = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());

  /** Azioni rapide; quelle admin solo per gli admin. Label ricalcolate al cambio lingua. */
  private readonly actions = computed<PaletteItem[]>(() => {
    this.langSvc.current();
    const t = (k: string) => this.translate.instant(k) as string;
    const list: PaletteItem[] = [
      { id: 'act:theme', section: 'actions', icon: 'palette', title: t('palette.action_theme'), run: () => this.theme.toggle() },
      { id: 'act:contact', section: 'actions', icon: 'mail', title: t('palette.action_contact'), url: '/contact' },
      { id: 'act:lab', section: 'actions', icon: 'flask', title: t('palette.action_lab'), url: '/lab' },
      { id: 'act:copy-link', section: 'actions', icon: 'send', title: t('palette.action_copy_link'), run: () => this.copyPageLink() },
    ];
    if (this.installPrompt.canPromptNatively()) {
      list.push({ id: 'act:install', section: 'actions', icon: 'arrow-down', title: t('palette.action_install'), run: () => void this.installPrompt.install() });
    }
    if (this.isAdmin()) {
      list.push(
        { id: 'act:new-post', section: 'actions', icon: 'article', title: t('palette.action_new_post'), url: '/dashboard/blog?new=1' },
        { id: 'act:new-project', section: 'actions', icon: 'grid', title: t('palette.action_new_project'), url: '/dashboard/projects?new=1' },
        { id: 'act:inbox', section: 'actions', icon: 'inbox', title: t('palette.action_inbox'), url: '/dashboard/contacts' },
      );
    }
    if (this.auth.isLoggedIn()) {
      list.push({ id: 'act:logout', section: 'actions', icon: 'logout', title: t('palette.action_logout'), run: () => this.auth.logout('/') });
    }
    return list;
  });

  /**
   * "Lingua: English"… una voce per ogni lingua diversa da quella corrente.
   * Solo cercando (es. "english", "lingua", "language"): nella lista iniziale
   * sette voci di lingua coprirebbero le azioni più utili.
   */
  private readonly languageActions = computed<PaletteItem[]>(() => {
    const current = this.langSvc.current();
    const detail = this.translate.instant('palette.action_language_detail') as string;
    return SUPPORTED_LANGS
      .filter(l => l.code !== current)
      .map(l => ({
        id: `act:lang-${l.code}`,
        section: 'actions' as const,
        icon: 'globe',
        title: this.translate.instant('palette.action_language', { lang: l.label }) as string,
        detail,
        run: () => void this.langSwitch.switchTo(l.code),
      }));
  });

  /** Tutte le pagine navigabili dal registro unico (pubbliche + admin per gli admin). */
  private readonly pages = computed<PaletteItem[]>(() => {
    this.langSvc.current();
    const admin = this.isAdmin();
    return NAV_REGISTRY
      .filter((e: NavEntry) => (e.navbar || e.sidebar || e.search) && (admin || e.access === 'public'))
      .map((e: NavEntry) => ({
        id: `page:${e.id}`,
        section: 'pages' as const,
        icon: e.icon,
        title: this.translate.instant(e.searchTitleKey ?? e.labelKey) as string,
        detail: e.descKey ? (this.translate.instant(e.descKey) as string) : undefined,
        url: e.route,
      }));
  });

  readonly items = computed<PaletteItem[]>(() => {
    const q = this.query();
    if (!q.trim()) {
      return mergeSections(this.actions(), this.pages().slice(0, MAX_IDLE_PAGES));
    }
    const content: PaletteItem[] = this.remote().map(hit => ({
      id: hit.id,
      section: 'content',
      icon: hit.type === 'post' ? 'article' : hit.type === 'project' ? 'grid' : 'search-doc',
      title: hit.title,
      detail: hit.excerpt,
      url: hit.url,
    }));
    return mergeSections(filterLocal([...this.actions(), ...this.languageActions()], q), filterLocal(this.pages(), q), content);
  });

  readonly activeId = computed(() => {
    const item = this.items()[this.activeIndex()];
    return item ? this.optionId(item) : null;
  });

  private readonly query$ = new Subject<string>();

  constructor() {
    this.query$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap(q => {
          if (q.trim().length < MIN_REMOTE_QUERY) {
            this.loading.set(false);
            return of<SearchHit[]>([]);
          }
          this.loading.set(true);
          return this.searchSvc.suggest(q.trim(), this.langSvc.current()).pipe(catchError(() => of<SearchHit[]>([])));
        }),
      )
      .subscribe(hits => {
        this.loading.set(false);
        this.remote.set(hits.filter(h => h.type !== 'page'));
      });

    effect(() => {
      if (this.overlay.open()) {
        this.query.set('');
        this.remote.set([]);
        this.activeIndex.set(0);
        this.analytics.trackClick('search', 'search_overlay_open');
        queueMicrotask(() => this.inputRef?.nativeElement?.focus());
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (isCmdK) {
      event.preventDefault();
      if (this.overlay.open()) this.close();
      else this.overlay.show();
      return;
    }
    if (event.key === 'Escape' && this.overlay.open()) {
      this.close();
      return;
    }
    if (this.overlay.open() || event.metaKey || event.ctrlKey || event.altKey || event.key !== '/') return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
    event.preventDefault();
    this.overlay.show();
  }

  onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.activeIndex.set(0);
    this.query$.next(value);
  }

  sectionStart(index: number): PaletteSection | null {
    const list = this.items();
    return index === 0 || list[index - 1]?.section !== list[index].section ? list[index].section : null;
  }

  optionId(item: PaletteItem): string {
    return `palette-opt-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  move(delta: number): void {
    const len = this.items().length;
    if (!len) return;
    this.activeIndex.update(i => (i + delta + len) % len);
  }

  onEnter(): void {
    if (this.items().length) this.select(this.activeIndex());
    else this.viewAll();
  }

  select(index: number): void {
    const item = this.items()[index];
    if (!item) return;
    this.analytics.trackClick('search', 'palette_select', item.url ?? item.id);
    this.close();
    if (item.run) {
      item.run();
      return;
    }
    if (item.url) {
      // Le rotte /dashboard non hanno prefisso lingua.
      const url = item.url.startsWith('/dashboard') ? item.url : withLangPrefix(item.url, this.langSvc.current());
      void this.router.navigateByUrl(url);
    }
  }

  viewAll(): void {
    const q = this.query().trim();
    if (q.length < MIN_REMOTE_QUERY) return;
    this.analytics.trackClick('search', 'search_overlay_view_all', q);
    void this.router.navigate([withLangPrefix('/search', this.langSvc.current())], { queryParams: { q } });
    this.close();
  }

  close(): void {
    this.overlay.close();
  }

  private copyPageLink(): void {
    const url = location.href;
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(url).then(
      () => this.snackbar.show(this.translate.instant('palette.link_copied'), 'success', 2500),
      () => this.snackbar.show(this.translate.instant('palette.copy_failed'), 'error', 3000),
    );
  }
}
