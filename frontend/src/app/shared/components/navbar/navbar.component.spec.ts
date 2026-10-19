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
    const { navbar } = await setup('/services');
    expect(navbar.isHomepage()).toBe(true);
    navbar.activeSection.set('services');
    expect(navbar.isActive(link('/services'))).toBe(true);
    expect(navbar.isActive(link('/projects'))).toBe(false);
  });

  it('treats /about as a page of its own, not as a homepage section', async () => {
    const { navbar } = await setup('/en/about');
    expect(navbar.isHomepage()).toBe(false);
    expect(navbar.isActive(link('/about'))).toBe(true);
  });

  it('lights up the parent link on sub-pages (an article → Blog, a tool → Lab)', async () => {
    let { navbar } = await setup('/blog/rxjs-signals');
    expect(navbar.isActive(link('/blog'))).toBe(true);
    TestBed.resetTestingModule();
    ({ navbar } = await setup('/en/lab/ocr'));
    expect(navbar.isActive(link('/lab'))).toBe(true);
    expect(navbar.isActive(link('/blog'))).toBe(false);
  });

  it('does not light up a link whose route is only a prefix of another word (/lab vs /laboratorio)', async () => {
    const { navbar } = await setup('/laboratorio');
    expect(navbar.isActive(link('/lab'))).toBe(false);
  });

  it('renders Contatti as the CTA and hides Lab from the mobile sheet (the drawer button is there)', async () => {
    const { navbar } = await setup('/homepage');
    expect(navbar.ctaLinkId).toBe('contact');
    expect(link('/contact').id).toBe('contact');
    expect(navbar.mobileSheetHiddenRoutes.has('/lab')).toBe(true);
    expect(navbar.mobileSheetHiddenRoutes.has('/about')).toBe(false);
  });

  it('shows the Dashboard link only to admins, not to plain logged-in users', async () => {
    const { navbar, loggedIn, admin } = await setup('/homepage', { loggedIn: true });
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(false);
    admin.set(true);
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(true);
    loggedIn.set(false);
    expect(navbar.desktopNavLinks().some(l => l.route === '/dashboard')).toBe(false);
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
