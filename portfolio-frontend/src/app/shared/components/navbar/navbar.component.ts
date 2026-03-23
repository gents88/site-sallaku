import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
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
  activeSection = '';

  readonly navLinks: NavLink[] = [
    { labelKey: 'nav.about',      fragment: 'about' },
    { labelKey: 'nav.tech',       fragment: 'tech-stack' },
    { labelKey: 'nav.projects',   fragment: 'projects' },
    { labelKey: 'nav.services',   fragment: '', route: '/services' },
    { labelKey: 'nav.experience', fragment: 'experience' },
    { labelKey: 'nav.skills',     fragment: 'skills' },
    { labelKey: 'nav.contact',    fragment: 'contact' },
    { labelKey: 'nav.blog',       fragment: '',  route: '/blog' },
  ];

  get desktopNavLinks() {
    return this.auth.isLoggedIn()
      ? [...this.navLinks, { labelKey: 'nav.dashboard', fragment: '', route: '/dashboard' }]
      : this.navLinks;
  }

  private sectionObserver: IntersectionObserver | null = null;

  constructor(
    public auth: AuthService,
    public authModal: AuthModalService,
    public langSvc: LanguageService,
  ) {}

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 50;
  }

  ngOnInit(): void {
    const sectionIds = this.navLinks.map(l => l.fragment).filter((f): f is string => !!f);
    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) this.activeSection = entry.target.id;
        });
      },
      { threshold: 0.3 },
    );
    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) this.sectionObserver?.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
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
