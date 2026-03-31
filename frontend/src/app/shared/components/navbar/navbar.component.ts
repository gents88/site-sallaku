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
import { LanguageService } from '../../../core/services/language.service';
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
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslateModule, MatIconModule, ThemeToggleComponent, LangSwitcherComponent],
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
  ];

  get desktopNavLinks() {
    return this.auth.isLoggedIn()
      ? [...this.navLinks, { labelKey: 'nav.dashboard', route: '/dashboard' }]
      : this.navLinks;
  }

  private routerSub: Subscription | null = null;
  private readonly platformId = inject(PLATFORM_ID);

  constructor(
    public auth: AuthService,
    public authModal: AuthModalService,
    public langSvc: LanguageService,
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
      const path = url.split('?')[0].split('#')[0];
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

  openLoginModal(): void {
    this.closeMenu();
    this.authModal.openLogin();
  }

  openAccountModal(): void {
    this.closeMenu();
    this.authModal.openAccount();
  }
}
