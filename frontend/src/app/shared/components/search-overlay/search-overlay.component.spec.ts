import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchOverlayComponent } from './search-overlay.component';
import { SearchOverlayService } from '../../../core/services/search-overlay.service';
import { SearchService } from '../../../core/services/search.service';
import { LanguageService } from '../../../core/services/language.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';

function setup(opts: { admin?: boolean; lang?: string } = {}) {
  const theme = { toggle: vi.fn() };
  const auth = { isLoggedIn: signal(!!opts.admin), isAdmin: signal(!!opts.admin), logout: vi.fn() };
  const search = { suggest: vi.fn(() => of([{ id: 'post:1', type: 'post', title: 'Angular signals', excerpt: 'x', url: '/blog/signals', tags: [], updatedAt: '' }])) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: SearchService, useValue: search },
      { provide: LanguageService, useValue: { current: signal(opts.lang ?? 'it') } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: AuthService, useValue: auth },
      { provide: ThemeService, useValue: theme },
    ],
  });
  const fixture = TestBed.createComponent(SearchOverlayComponent);
  fixture.detectChanges();
  const overlay = TestBed.inject(SearchOverlayService);
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { fixture, c: fixture.componentInstance, overlay, theme, search, navigate };
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
});
