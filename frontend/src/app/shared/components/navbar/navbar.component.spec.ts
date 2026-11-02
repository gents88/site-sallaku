import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LanguageService } from '../../../core/services/language.service';
import { navbarEntries } from '../../../core/navigation/nav-registry';

@Component({ template: '' })
class BlankComponent {}

async function setup(url: string, opts: { loggedIn?: boolean; admin?: boolean } = {}) {
  const loggedIn = signal(!!opts.loggedIn);
  const admin = signal(!!opts.admin);
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: '**', component: BlankComponent }]),
      { provide: AuthService, useValue: { isLoggedIn: loggedIn, isAdmin: admin, currentUser: signal(null) } },
      { provide: AuthModalService, useValue: { openLogin: vi.fn(), openAccount: vi.fn() } },
      { provide: DrawerService, useValue: { drawerOpen: signal(false), toggle: vi.fn(), open: vi.fn() } },
      { provide: SearchOverlayService, useValue: { show: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: LanguageService, useValue: { current: () => 'it' } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const navbar = TestBed.runInInjectionContext(() => new NavbarComponent());
  return { navbar, loggedIn, admin };
}

const link = (route: string) => navbarEntries().find(e => e.route === route)!;

describe('NavbarComponent', () => {
  it('does not treat /contact as the homepage (regression: Home tab lit on the Contact page)', async () => {
    const { navbar } = await setup('/contact');
    expect(navbar.isHomepage()).toBe(false);
    expect(navbar.activeBottomTab()).toBe('other');
    expect(navbar.isActive(link('/contact'))).toBe(true);
    expect(navbar.isActive(link('/about'))).toBe(false);
  });

  it('strips the language prefix when matching the current route', async () => {
    const { navbar } = await setup('/en/blog');
    expect(navbar.isActive(link('/blog'))).toBe(true);
  });

  it('follows the scroll-spy section on HomeComponent routes', async () => {
    const { navbar } = await setup('/about');
    expect(navbar.isHomepage()).toBe(true);
    navbar.activeSection.set('skills');
    expect(navbar.isActive(link('/skills'))).toBe(true);
    expect(navbar.isActive(link('/about'))).toBe(false);
  });

  it('shows the Dashboard link only to admins, not to plain logged-in users', async () => {
    const { navbar, loggedIn, admin } = await setup('/homepage', { loggedIn: true });
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(false);
    admin.set(true);
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(true);
    loggedIn.set(false);
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(false);
  });

  it('calcola scrolled e avanzamento dalle altezze in cache, senza rileggere scrollHeight a ogni frame', async () => {
    const { navbar } = await setup('/contact');
    const internals = navbar as unknown as { docScrollHeight: number; docClientHeight: number; onScrollFrame(): void };
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    const heightRead = vi.fn(() => 0);
    Object.defineProperty(document.documentElement, 'scrollHeight', { get: heightRead, configurable: true });
    try {
      internals.docScrollHeight = 2000;
      internals.docClientHeight = 1000;

      internals.onScrollFrame();

      expect(navbar.scrolled()).toBe(true);
      expect(navbar.scrollProgress()).toBe(50);
      expect(heightRead).not.toHaveBeenCalled();
    } finally {
      delete (document.documentElement as unknown as Record<string, unknown>)['scrollHeight'];
      if (original) Object.defineProperty(window, 'scrollY', original);
    }
  });

  it('toggles the mobile menu and the html.menu-open class', async () => {
    const { navbar } = await setup('/homepage');
    navbar.toggleMenu();
    expect(navbar.mobileMenuOpen()).toBe(true);
    expect(document.documentElement.classList.contains('menu-open')).toBe(true);
    navbar.closeMenu();
    expect(navbar.mobileMenuOpen()).toBe(false);
    expect(document.documentElement.classList.contains('menu-open')).toBe(false);
  });
});
