import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchOverlayComponent } from './search-overlay.component';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { SearchService } from '../../../core/services/search.service';
import { AdminSearchHit, AdminSearchService } from '../../../core/services/admin-search.service';
import { LanguageService } from '../../../core/services/language.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LanguageSwitchService } from '../../../core/services/language-switch.service';
import { InstallPromptService } from '../../../core/services/install-prompt.service';
import { SnackbarService } from '../../../core/services/snackbar.service';

const ADMIN_HITS: AdminSearchHit[] = [
  { id: 'contact:c1', type: 'contact', title: 'Mario Rossi', detail: 'Preventivo · mario@x.it', url: '/dashboard/contacts?q=mario%40x.it' },
  { id: 'draft:p1', type: 'draft', title: 'Bozza SEO', detail: 'IT · bozza', url: '/dashboard/blog?edit=p1' },
];

function setup(opts: { admin?: boolean; lang?: string; canInstall?: boolean; adminFails?: boolean } = {}) {
  const langSwitch = { switchTo: vi.fn(() => Promise.resolve()) };
  const installPrompt = { canPromptNatively: signal(!!opts.canInstall), install: vi.fn(() => Promise.resolve(true)) };
  const snackbar = { show: vi.fn() };
  const theme = { toggle: vi.fn() };
  const auth = { isLoggedIn: signal(!!opts.admin), isAdmin: signal(!!opts.admin), logout: vi.fn() };
  const search = { suggest: vi.fn(() => of([{ id: 'post:1', type: 'post', title: 'Angular signals', excerpt: 'x', url: '/blog/signals', tags: [], updatedAt: '' }])) };
  const adminSearch = { search: vi.fn(() => (opts.adminFails ? throwError(() => new Error('500')) : of(ADMIN_HITS))) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: SearchService, useValue: search },
      { provide: AdminSearchService, useValue: adminSearch },
      { provide: LanguageService, useValue: { current: signal(opts.lang ?? 'it') } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: AuthService, useValue: auth },
      { provide: ThemeService, useValue: theme },
      { provide: LanguageSwitchService, useValue: langSwitch },
      { provide: InstallPromptService, useValue: installPrompt },
      { provide: SnackbarService, useValue: snackbar },
    ],
  });
  const fixture = TestBed.createComponent(SearchOverlayComponent);
  fixture.detectChanges();
  const overlay = TestBed.inject(SearchOverlayService);
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { fixture, c: fixture.componentInstance, overlay, theme, search, adminSearch, navigate, langSwitch, installPrompt, snackbar };
}

const key = (k: string, mods: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, ...mods });

describe('SearchOverlayComponent (unified palette)', () => {
  afterEach(() => vi.useRealTimers());

  it('opens and closes with Ctrl/Cmd+K, and opens with "/" outside inputs', () => {
    const { c, overlay } = setup();
    c.onGlobalKeydown(key('k', { ctrlKey: true }));
    expect(overlay.open()).toBe(true);
    c.onGlobalKeydown(key('k', { metaKey: true }));
    expect(overlay.open()).toBe(false);
    c.onGlobalKeydown(key('/'));
    expect(overlay.open()).toBe(true);
  });

  it('shows actions then pages with an empty query; admin actions only for admins', () => {
    const visitor = setup();
    const sections = visitor.c.items().map(i => i.section);
    expect(sections[0]).toBe('actions');
    expect(sections).toContain('pages');
    expect(visitor.c.items().some(i => i.id === 'act:new-post')).toBe(false);
    TestBed.resetTestingModule();
    const admin = setup({ admin: true });
    expect(admin.c.items().some(i => i.id === 'act:new-post')).toBe(true);
  });

  it('runs an action instead of navigating', () => {
    const { c, theme, navigate } = setup();
    const idx = c.items().findIndex(i => i.id === 'act:theme');
    c.select(idx);
    expect(theme.toggle).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the language prefix for public pages but not for /dashboard routes', () => {
    const { c, navigate } = setup({ admin: true, lang: 'en' });
    c.select(c.items().findIndex(i => i.id === 'act:contact'));
    expect(navigate).toHaveBeenLastCalledWith('/en/contact');
    c.select(c.items().findIndex(i => i.id === 'act:new-post'));
    expect(navigate).toHaveBeenLastCalledWith('/dashboard/blog?new=1');
  });

  it('merges remote content results after the debounce, in their own section', () => {
    vi.useFakeTimers();
    const { c, search } = setup();
    c.onQuery({ target: { value: 'signals' } } as unknown as Event);
    vi.advanceTimersByTime(300);
    expect(search.suggest).toHaveBeenCalledWith('signals', 'it');
    const content = c.items().filter(i => i.section === 'content');
    expect(content.map(i => i.url)).toEqual(['/blog/signals']);
  });

  describe('ricerca admin (contatti, utenti, bozze, note)', () => {
    const type = (c: SearchOverlayComponent, q: string) => {
      c.onQuery({ target: { value: q } } as unknown as Event);
      vi.advanceTimersByTime(300);
    };

    it("per l'admin aggiunge una sezione tra azioni e pagine, che apre la pagina giusta", () => {
      vi.useFakeTimers();
      const { c, adminSearch, navigate } = setup({ admin: true });
      type(c, 'mario');
      expect(adminSearch.search).toHaveBeenCalledWith('mario');
      const sections = c.items().map(i => i.section);
      expect(sections.indexOf('admin')).toBeGreaterThanOrEqual(0);
      expect(c.items().filter(i => i.section === 'admin').map(i => i.title)).toEqual(['Mario Rossi', 'Bozza SEO']);
      // l'ordine delle sezioni è fisso: admin prima di pagine e contenuti
      const order = [...new Set(sections)];
      expect(order.indexOf('admin')).toBeLessThan(order.indexOf('content'));
      c.select(c.items().findIndex(i => i.id === 'draft:p1'));
      expect(navigate).toHaveBeenLastCalledWith('/dashboard/blog?edit=p1');
    });

    it('un visitatore non chiama mai la ricerca admin', () => {
      vi.useFakeTimers();
      const { c, adminSearch, search } = setup();
      type(c, 'mario');
      expect(search.suggest).toHaveBeenCalled();
      expect(adminSearch.search).not.toHaveBeenCalled();
      expect(c.items().some(i => i.section === 'admin')).toBe(false);
    });

    it('se la ricerca admin fallisce restano i contenuti pubblici', () => {
      vi.useFakeTimers();
      const { c } = setup({ admin: true, adminFails: true });
      type(c, 'signals');
      expect(c.items().some(i => i.section === 'admin')).toBe(false);
      expect(c.items().some(i => i.section === 'content')).toBe(true);
    });

    it('riaprendo la palette i risultati admin precedenti spariscono', () => {
      vi.useFakeTimers();
      const { c, overlay, fixture } = setup({ admin: true });
      type(c, 'mario');
      expect(c.adminRemote()).toHaveLength(2);
      overlay.show();
      fixture.detectChanges();
      TestBed.tick();
      expect(c.adminRemote()).toEqual([]);
    });
  });

  describe('extra actions', () => {
    const query = (c: SearchOverlayComponent, q: string) => c.onQuery({ target: { value: q } } as unknown as Event);
    const ids = (c: SearchOverlayComponent) => c.items().map(i => i.id);

    it('switches language from the palette, only offering the other languages and only when searching', () => {
      const { c, langSwitch } = setup({ lang: 'it' });
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('it', { palette: { action_language: 'Lingua: {{lang}}' } });
      translate.use('it');
      expect(ids(c).some(id => id.startsWith('act:lang-'))).toBe(false);

      query(c, 'english');
      expect(ids(c)).toContain('act:lang-en');
      query(c, 'italiano');
      expect(ids(c)).not.toContain('act:lang-it');

      query(c, 'deutsch');
      c.select(c.items().findIndex(i => i.id === 'act:lang-de'));
      expect(langSwitch.switchTo).toHaveBeenCalledWith('de');
    });

    it('copies the current page link', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { c, snackbar } = setup();
      c.select(c.items().findIndex(i => i.id === 'act:copy-link'));
      await Promise.resolve();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith(location.href);
      expect(snackbar.show).toHaveBeenCalledWith('palette.link_copied', 'success', 2500);
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it('offers "install as app" only when the browser allows it', () => {
      expect(ids(setup().c)).not.toContain('act:install');
      TestBed.resetTestingModule();
      const { c, installPrompt } = setup({ canInstall: true });
      c.select(c.items().findIndex(i => i.id === 'act:install'));
      expect(installPrompt.install).toHaveBeenCalled();
    });
  });
});
