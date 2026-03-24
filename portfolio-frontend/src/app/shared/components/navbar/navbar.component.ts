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
  activeSection = '';
  isHomepage = false;

  // section id → route corrispondente nella navbar
  private readonly sectionRouteMap: Record<string, string> = {
    'homepage':   '/homepage',
    'about':      '/about',
    'tech-stack': '/tech-stack',
    'projects':   '/projects',
    'experience': '/experience',
    'skills':     '/skills',
    'contact':    '/contact',
  };

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

  private sectionObserver: IntersectionObserver | null = null;
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
  }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const handleRoute = (url: string) => {
      const path = url.split('?')[0];
      this.isHomepage = path === '/homepage' || path === '/';
      if (this.isHomepage) {
        this.activeSection = 'homepage';
        setTimeout(() => this.setupObserver(), 200);
      } else {
        this.teardownObserver();
        this.activeSection = '';
      }
      this.cdr.markForCheck();
    };

    handleRoute(this.router.url);

    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => handleRoute(e.urlAfterRedirects));
  }

  private setupObserver(): void {
    this.teardownObserver();
    const ids = Object.keys(this.sectionRouteMap);
    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          this.activeSection = visible[0].target.id;
          this.cdr.markForCheck();
        }
      },
      { threshold: 0.3 },
    );
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.sectionObserver?.observe(el);
    });
  }

  private teardownObserver(): void {
    this.sectionObserver?.disconnect();
    this.sectionObserver = null;
  }

  ngOnDestroy(): void {
    this.teardownObserver();
    this.routerSub?.unsubscribe();
  }

  toggleMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMenu(): void { this.mobileMenuOpen = false; }

  openLoginModal(): void {
    this.closeMenu();
    this.authModal.openLogin();
  }

  openAccountModal(): void {
    this.closeMenu();
    this.authModal.openAccount();
  }
}
