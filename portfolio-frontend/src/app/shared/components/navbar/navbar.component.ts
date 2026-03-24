import { Component, HostListener, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { LangSwitcherComponent } from '../lang-switcher/lang-switcher.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import { LanguageService } from '../../../core/services/language.service';

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
      ? [...this.navLinks, { labelKey: 'nav.dashboard', fragment: '', route: '/dashboard' }]
      : this.navLinks;
  }

  private readonly platformId = inject(PLATFORM_ID);

  constructor(
    public auth: AuthService,
    public authModal: AuthModalService,
    public langSvc: LanguageService,
  ) {}

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 50;
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {}

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
