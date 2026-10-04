import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, ViewChild, afterNextRender, computed, inject, signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { filter, fromEvent, map, startWith } from 'rxjs';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { LangSwitcherComponent } from '../lang-switcher/lang-switcher.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import { LanguageService, stripLangPrefix } from '../../../core/services/language.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { NavEntry, homepageRoutes, navbarEntries } from '../../../core/navigation/nav-registry';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { SectionScrollSpy, bottomTabFor } from './section-scroll-spy';

const DASHBOARD_LINK: NavEntry = {
  id: 'dashboard', route: '/dashboard', labelKey: 'nav.dashboard', group: 'overview', access: 'admin', icon: 'dashboard',
};

/** Path logico (senza prefisso lingua, query e fragment). */
function basePathOf(url: string): string {
  return stripLangPrefix(url.split('?')[0].split('#')[0]).basePath;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, TranslateModule, MatIconModule, MatButtonModule, ThemeToggleComponent, LangSwitcherComponent, LangUrlPipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly authModal = inject(AuthModalService);
  readonly langSvc = inject(LanguageService);
  readonly drawer = inject(DrawerService);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly searchOverlay = inject(SearchOverlayService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  @ViewChild('navMenu') private navMenuRef?: ElementRef<HTMLUListElement>;
  @ViewChild('moreTab') private moreTabRef?: ElementRef<HTMLButtonElement>;

  readonly mobileMenuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly scrollProgress = signal(0);
  readonly activeSection = signal('');

  private readonly homeRoutes = homepageRoutes();
  private readonly baseNavLinks = navbarEntries();

  readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => basePathOf(e.urlAfterRedirects)),
      startWith(basePathOf(this.router.url)),
    ),
    { initialValue: basePathOf(this.router.url) },
  );

  readonly isHomepage = computed(() => this.homeRoutes.has(this.currentPath()));

  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());

  /** La voce Dashboard solo per gli admin: un utente 'user' veniva rimbalzato al login dall'authGuard. */
  readonly desktopNavLinks = computed(() => (this.isAdminUser() ? [...this.baseNavLinks, DASHBOARD_LINK] : this.baseNavLinks));

  // Sul mobile, Progetti e Servizi hanno una tab dedicata nella bottom bar:
  // il loro <li> in nav-menu viene nascosto via CSS solo sotto i 900px, così
  // lo sheet "Altro" non li ripete mentre la nav desktop resta invariata.
  readonly bottomTabRoutes = new Set(['/projects', '/services']);

  readonly activeBottomTab = computed(() => bottomTabFor(this.isHomepage(), this.activeSection(), this.currentPath()));

  // stesse label mostrate nell'header della sidebar (SidebarComponent)
  readonly drawerBadge = computed(() => (this.isAdminUser() ? '⚙️' : '🧰'));

  /** Chiave di traduzione (non testo già tradotto): il template la passa a `| translate`, così resta reattiva al cambio lingua. */
  readonly drawerLabelKey = computed(() => (this.isAdminUser() ? 'sidebar.brand_admin' : 'sidebar.brand_tools'));

  private readonly spy = new SectionScrollSpy(id => this.activeSection.set(id));
  private scrollFrame = 0;

  constructor() {
    if (!this.isBrowser) return;

    afterNextRender(() => {
      this.onScrollFrame();

      // passive + un solo calcolo per frame: lo scroll non blocca più il thread.
      fromEvent(window, 'scroll', { passive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (this.scrollFrame) return;
          this.scrollFrame = requestAnimationFrame(() => {
            this.scrollFrame = 0;
            this.onScrollFrame();
          });
        });

      fromEvent(window, 'resize', { passive: true })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.attachSpy());

      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(e => this.onDocumentKeydown(e));

      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.onRouteChange());
      this.onRouteChange();
    });

    this.destroyRef.onDestroy(() => {
      this.spy.detach();
      if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    });
  }

  /** Link evidenziato: sulla home segue lo scroll-spy, altrove la rotta corrente. */
  isActive(link: NavEntry): boolean {
    return this.isHomepage() ? !!link.homeSection && link.homeSection === this.activeSection() : this.currentPath() === link.route;
  }

  openSearch(): void {
    this.searchOverlay.show();
    this.analytics.trackClick('navbar', 'navbar_search_open');
  }

  toggleMenu(): void {
    if (this.mobileMenuOpen()) {
      this.closeMenu();
      return;
    }
    this.mobileMenuOpen.set(true);
    this.setMenuOpenClass(true);
    // Il focus entra nello sheet: altrimenti Tab continuerebbe sulla pagina dietro il backdrop.
    queueMicrotask(() => this.focusableInMenu()[0]?.focus());
  }

  closeMenu(restoreFocus = false): void {
    if (!this.mobileMenuOpen()) return;
    this.mobileMenuOpen.set(false);
    this.setMenuOpenClass(false);
    if (restoreFocus) this.moreTabRef?.nativeElement.focus();
  }

  /** Focus trap dello sheet "Altro": Tab/Shift+Tab restano dentro finché è aperto. */
  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.mobileMenuOpen()) return;
    const focusable = this.focusableInMenu();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  openDrawerFromMenu(): void {
    this.closeMenu();
    this.drawer.open();
    this.analytics.trackClick('sidebar', 'sidebar_open_mobile_menu');
  }

  /** Trigger etichettato in navbar: visibile solo nella fascia 901–1199px. */
  toggleDrawerFromNavbar(): void {
    const willOpen = !this.drawer.drawerOpen();
    this.drawer.toggle();
    this.analytics.trackClick('sidebar', willOpen ? 'sidebar_open_navbar' : 'sidebar_close_navbar');
  }

  openLoginModal(): void {
    this.closeMenu();
    this.authModal.openLogin();
  }

  openAccountModal(): void {
    this.closeMenu();
    this.authModal.openAccount();
  }

  private onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.mobileMenuOpen()) this.closeMenu(true);
  }

  private onScrollFrame(): void {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    this.scrolled.set(scrollTop > 50);
    this.scrollProgress.set(scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0);
    if (this.isHomepage()) this.spy.checkBottom();
  }

  private onRouteChange(): void {
    if (!this.isHomepage()) {
      this.spy.detach();
      this.activeSection.set('');
      return;
    }
    // Pre-imposta subito dal path (/about → about), poi lo spy corregge
    // dalla posizione reale quando le sezioni del nuovo componente esistono.
    const path = this.currentPath();
    this.activeSection.set(path === '/' || path === '/homepage' ? 'homepage' : path.slice(1));
    setTimeout(() => this.attachSpy(), 400);
  }

  private attachSpy(): void {
    if (!this.isHomepage()) return;
    const main = document.getElementById('main-content') ?? document.body;
    this.spy.attach(main);
  }

  private setMenuOpenClass(open: boolean): void {
    document.documentElement.classList.toggle('menu-open', open);
    document.body.classList.toggle('menu-open', open);
  }

  private focusableInMenu(): HTMLElement[] {
    const menu = this.navMenuRef?.nativeElement;
    if (!menu) return [];
    return Array.from(menu.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
      .filter(el => el.offsetParent !== null);
  }
}
