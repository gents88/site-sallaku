import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, Routes, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { REVEAL_MARGIN_PX, SidebarComponent, revealScrollTop, scrollEdgesOf } from './sidebar.component';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { AdminNotificationsService, NotificationSummary } from '../../../core/services/admin-notifications.service';
import { LanguageService } from '../../../core/services/language.service';

const NO_NOTIFICATIONS: NotificationSummary = { contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 };

function setupFixture(admin: boolean, summary: NotificationSummary = NO_NOTIFICATIONS, routes: Routes = []) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter(routes),
      { provide: AuthService, useValue: { isLoggedIn: signal(admin), isAdmin: signal(admin) } },
      { provide: DrawerService, useValue: { mode: signal('rail'), drawerOpen: signal(false), expanded: signal(true), railExpanded: signal(true), setHover: vi.fn(), close: vi.fn(), toggleRail: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: AdminNotificationsService, useValue: { summary: signal(summary) } },
      { provide: LanguageService, useValue: { current: () => 'it' } },
    ],
  });
  const fixture = TestBed.createComponent(SidebarComponent);
  fixture.detectChanges();
  return fixture;
}

function setup(admin: boolean) {
  return setupFixture(admin).nativeElement as HTMLElement;
}

function link(el: HTMLElement, href: string): HTMLElement {
  return el.querySelector(`a.nav-item[href="${href}"]`) as HTMLElement;
}

describe('SidebarComponent', () => {
  it('renders the public tools from the registry for visitors, without admin groups', () => {
    const el = setup(false);
    const hrefs = Array.from(el.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/lab/library');
    expect(hrefs).not.toContain('/dashboard/blog');
  });

  it('adds overview and content management for admins', () => {
    const el = setup(true);
    const hrefs = Array.from(el.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/dashboard', '/dashboard/blog', '/dashboard/newsletter']));
  });

  it('exposes a single labelled navigation landmark (no role on <aside>)', () => {
    const el = setup(false);
    expect(el.querySelector('aside')?.getAttribute('role')).toBeNull();
    expect(el.querySelectorAll('nav, [role="navigation"]')).toHaveLength(1);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders SVG icons instead of emoji', () => {
    const el = setup(false);
    const icon = el.querySelector('a.nav-item .nav-icon');
    expect(icon?.querySelector('svg')).not.toBeNull();
    // Le forme devono esserci davvero: prima l'svg c'era ma vuoto (sanitizer).
    expect(icon?.querySelector('svg')?.children.length).toBeGreaterThan(0);
    expect(icon?.textContent?.trim()).toBe('');
  });
});

describe('SidebarComponent: CTA "N strumenti disponibili"', () => {
  it('conta solo gli strumenti del Lab, non "I miei file"', () => {
    const fixture = setupFixture(false);
    // 6 AI + Workspace + 6 strumenti: le stesse voci della pagina /lab.
    expect(fixture.componentInstance.itemCount()).toBe(13);
  });

  it('per l\'admin non conta Dashboard, Contatti, Blog e le altre pagine di gestione', () => {
    const fixture = setupFixture(true);
    const admin = fixture.componentInstance;
    const allItems = admin.navGroups().reduce((total, g) => total + g.items.length, 0);
    expect(allItems).toBeGreaterThan(13);
    expect(admin.itemCount()).toBe(13);
  });
});

describe('SidebarComponent: badge sulle voci admin', () => {
  const pending: NotificationSummary = { contactsUnread: 2, followUpsDue: 1, testimonialsPending: 0, notesPending: 120, liveHandoffsWaiting: 1 };

  it('mostra i contatori del campanello sulle voci corrispondenti', () => {
    const el = setupFixture(true, pending).nativeElement as HTMLElement;

    expect(link(el, '/dashboard/contacts').querySelector('.nav-badge')?.textContent?.trim()).toBe('3');
    expect(link(el, '/dashboard/notes').querySelector('.nav-badge')?.textContent?.trim()).toBe('99+');
    expect(link(el, '/dashboard/testimonials').querySelector('.nav-badge')).toBeNull();
    expect(link(el, '/dashboard/blog').querySelector('.nav-badge')).toBeNull();
  });

  it('evidenzia come urgente la chat live in attesa sulla Dashboard', () => {
    const el = setupFixture(true, pending).nativeElement as HTMLElement;
    const badge = link(el, '/dashboard').querySelector('.nav-badge');
    expect(badge?.classList).toContain('nav-badge--urgent');
    expect(link(el, '/dashboard/contacts').querySelector('.nav-badge')?.classList).not.toContain('nav-badge--urgent');
  });

  it('nasconde il numero agli screen reader e legge invece le frasi del campanello', () => {
    const el = setupFixture(true, pending).nativeElement as HTMLElement;
    const contacts = link(el, '/dashboard/contacts');
    expect(contacts.querySelector('.nav-badge')?.getAttribute('aria-hidden')).toBe('true');
    const sr = contacts.querySelector('.nav-badge-sr')?.textContent ?? '';
    expect(sr).toContain('2 notifications.contacts_unread');
    expect(sr).toContain('1 notifications.followups_due');
  });

  it('non mostra badge ai visitatori', () => {
    const el = setupFixture(false, pending).nativeElement as HTMLElement;
    expect(el.querySelector('.nav-badge')).toBeNull();
  });
});

describe('revealScrollTop', () => {
  it('non scorre se la voce è già visibile con il margine', () => {
    expect(revealScrollTop(0, 400, 100, 40)).toBeNull();
  });

  it('scorre in giù quanto basta per mostrare una voce sotto la piega', () => {
    expect(revealScrollTop(0, 400, 500, 40)).toBe(500 + 40 + REVEAL_MARGIN_PX - 400);
  });

  it('scorre in su per una voce sopra l\'area visibile, senza andare sotto zero', () => {
    expect(revealScrollTop(300, 400, 100, 40)).toBe(100 - REVEAL_MARGIN_PX);
    expect(revealScrollTop(300, 400, 10, 40)).toBe(0);
  });

  it('restituisce null anche quando il bersaglio coincide con la posizione attuale', () => {
    expect(revealScrollTop(0, 400, 0, 40)).toBeNull();
  });
});

describe('scrollEdgesOf', () => {
  it('segnala i bordi con altro contenuto, con 1px di tolleranza', () => {
    expect(scrollEdgesOf(0, 400, 400)).toEqual({ top: false, bottom: false });
    expect(scrollEdgesOf(0, 800, 400)).toEqual({ top: false, bottom: true });
    expect(scrollEdgesOf(200, 800, 400)).toEqual({ top: true, bottom: true });
    expect(scrollEdgesOf(399.5, 800, 400)).toEqual({ top: true, bottom: false });
  });
});

describe('SidebarComponent: lista che scorre', () => {
  /** jsdom non fa layout: altezze, posizioni e scrollTop vanno simulati. */
  function fakeLayout(el: HTMLElement) {
    const nav = el.querySelector('.sidebar-nav') as HTMLElement;
    let scrollTop = 0;
    Object.defineProperty(nav, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(nav, 'scrollHeight', { configurable: true, value: 800 });
    Object.defineProperty(nav, 'scrollTop', { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) });
    nav.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    el.querySelectorAll<HTMLElement>('a.nav-item').forEach((item, i) => {
      item.getBoundingClientRect = () => ({ top: 100 + i * 40 - scrollTop, height: 36 }) as DOMRect;
    });
    return nav;
  }

  it('accende la sfumatura sui bordi che hanno altro contenuto', () => {
    const fixture = setupFixture(false);
    const nav = fakeLayout(fixture.nativeElement);

    nav.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(nav.classList).toContain('fade-bottom');
    expect(nav.classList).not.toContain('fade-top');

    nav.scrollTop = 600;
    nav.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(nav.classList).toContain('fade-top');
    expect(nav.classList).not.toContain('fade-bottom');
  });

  it('a fine navigazione porta in vista la voce attiva sotto la piega', async () => {
    const fixture = setupFixture(false, NO_NOTIFICATIONS, [{ path: '**', children: [] }]);
    const el = fixture.nativeElement as HTMLElement;
    const nav = fakeLayout(el);
    const items = Array.from(el.querySelectorAll<HTMLElement>('a.nav-item'));
    const scannerIndex = items.findIndex(a => a.getAttribute('href') === '/lab/scanner');
    expect(scannerIndex).toBeGreaterThan(5);

    await TestBed.inject(Router).navigateByUrl('/lab/scanner');
    await fixture.whenStable();
    TestBed.inject(ApplicationRef).tick();

    expect(link(el, '/lab/scanner').classList).toContain('active');
    // Posizione nel contenuto = indice × 40; deve finire dentro i 200px visibili col margine.
    expect(nav.scrollTop).toBe(scannerIndex * 40 + 36 + REVEAL_MARGIN_PX - 200);
  });
});
