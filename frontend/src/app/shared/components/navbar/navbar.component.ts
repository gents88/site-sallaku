import { Component, HostListener, OnInit, OnDestroy, inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { LangSwitcherComponent } from '../lang-switcher/lang-switcher.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import { LanguageService, stripLangPrefix } from '../../../core/services/language.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { filter, Subscription } from 'rxjs';

interface NavLink {
  labelKey: string;
  fragment?: string;
  route?: string;
  href?: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslateModule, MatIconModule, ThemeToggleComponent, LangSwitcherComponent, LangUrlPipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  scrolled = false;
  scrollProgress = 0;
  activeSection = '';
  isHomepage = false;

  // route che caricano HomeComponent e devono avere il focus attivo
  private readonly homepageRoutes = new Set(['/', '/homepage', '/about', '/tech-stack', '/projects', '/services', '/experience', '/skills', '/contact']);

  // sezioni presenti nella homepage, nell'ordine in cui appaiono nel DOM
  private readonly sectionIds = ['homepage', 'about', 'tech-stack', 'projects', 'services', 'experience', 'skills', 'contact'];

  readonly navLinks: NavLink[] = [
    { labelKey: 'nav.about',      route: '/about' },
    { labelKey: 'nav.tech',       route: '/tech-stack' },
    { labelKey: 'nav.projects',   route: '/projects' },
    { labelKey: 'nav.services',   route: '/services' },
    { labelKey: 'nav.experience', route: '/experience' },
    { labelKey: 'nav.skills',     route: '/skills' },
    { labelKey: 'nav.contact',    route: '/contact' },
    { labelKey: 'nav.blog',       route: '/blog' },
    { labelKey: 'nav.testimonials', route: '/testimonials' },
  ];

  get desktopNavLinks() {
    return this.auth.isLoggedIn()
      ? [...this.navLinks, { labelKey: 'nav.dashboard', route: '/dashboard' }]
      : this.navLinks;
  }

  // Sul mobile, Progetti e Servizi hanno una tab dedicata nella bottom bar:
  // il loro <li> in nav-menu viene nascosto via CSS solo sotto i 900px, così
  // lo sheet "Altro" non li ripete mentre la nav desktop resta invariata.
  readonly bottomTabRoutes = new Set(['/projects', '/services']);

  get activeBottomTab(): 'home' | 'projects' | 'services' | 'other' {
    if (!this.isHomepage) return 'other';
    if (this.activeSection === 'homepage') return 'home';
    if (this.activeSection === 'projects') return 'projects';
    if (this.activeSection === 'services') return 'services';
    return 'other';
  }

  // stesse label mostrate nell'header della sidebar (SidebarComponent)
  get drawerBadge(): string {
    return this.auth.isLoggedIn() && this.auth.isAdmin() ? '⚙️' : '🧰';
  }

  get drawerLabel(): string {
    return this.auth.isLoggedIn() && this.auth.isAdmin() ? 'Admin' : 'AI & Tools';
  }

  get drawerToggleLabel(): string {
    return `${this.drawerBadge} ${this.drawerLabel}`;
  }

  private routerSub: Subscription | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly analytics = inject(AnalyticsTrackingService);

  constructor(
    public auth: AuthService,
    public authModal: AuthModalService,
    public langSvc: LanguageService,
    public drawer: DrawerService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 50;
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const scrollHeight = doc.scrollHeight - doc.clientHeight;
    this.scrollProgress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
    if (this.isHomepage) this.updateActiveSectionFromScroll();
  }

  private updateActiveSectionFromScroll(): void {
    const OFFSET = 120; // altezza navbar + buffer
    let active = 'homepage';
    for (const id of this.sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= OFFSET) {
        active = id;
      }
    }
    if (active !== this.activeSection) {
      this.activeSection = active;
      this.cdr.markForCheck();
    }
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const handleRoute = (url: string) => {
      // Strip any /en, /es, ... prefix first — homepageRoutes/sectionId below
      // are language-neutral logical paths, matching what withLangPrefix
      // expects and what the (pipe-wrapped) nav links actually point at.
      const { basePath: path } = stripLangPrefix(url.split('?')[0].split('#')[0]);
      const wasHomepage = this.isHomepage;
      this.isHomepage = this.homepageRoutes.has(path);

      if (this.isHomepage) {
        // pre-setta subito il focus basandosi sul path
        const sectionId = (path === '/' || path === '/homepage') ? 'homepage' : path.slice(1);
        this.activeSection = sectionId;
        // dopo che il DOM è aggiornato, ricalcola dalla posizione reale di scroll
        setTimeout(() => this.updateActiveSectionFromScroll(), 400);
      } else {
        this.activeSection = '';
      }
      this.cdr.markForCheck();
    };

    handleRoute(this.router.url);

    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => handleRoute(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  toggleMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const html = document.documentElement;
    if (this.mobileMenuOpen) {
      html.classList.add('menu-open');
      document.body.classList.add('menu-open');
    } else {
      html.classList.remove('menu-open');
      document.body.classList.remove('menu-open');
    }
  }
  closeMenu(): void {
    this.mobileMenuOpen = false;
    document.documentElement.classList.remove('menu-open');
    document.body.classList.remove('menu-open');
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
}
