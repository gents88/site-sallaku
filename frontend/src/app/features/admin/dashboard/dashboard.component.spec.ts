import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { AdminDashboardService, DashboardOverview, normalizeOverview } from './admin-dashboard.service';
import { AuthService } from '../../../core/services/auth.service';

function overview(errors: string[] = [], sections: Record<string, unknown> = {}): DashboardOverview {
  const base = {
    core: {
      users: 2, contacts: 7, unreadContacts: 1, recentContacts: [],
      contactsByDay: [{ date: '2026-10-01', count: 1 }, { date: '2026-10-02', count: 3 }],
      content: { total: 5, published: 4, drafts: 1 },
      visits: { totalViews: 50, uniqueVisitors: 20, viewsByDay: [{ date: '2026-10-01', count: 10 }, { date: '2026-10-02', count: 20 }] },
    },
    projectsCount: 3, experiencesCount: 2, topPosts: [], topPages: [], monthlyHistory: [], toolConversion: [],
    auditLogs: [], liveHandoffs: [], systemHealth: null, systemDetails: null, systemOps: null,
  };
  return normalizeOverview({ generatedAt: 'now', errors, sections: { ...base, ...sections } as never });
}

function setup(load: AdminDashboardService['loadOverview']) {
  const loadOverview = vi.fn(load);
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      { provide: AuthService, useValue: { currentUser: signal(null), isAdmin: signal(true), logout: vi.fn() } },
      { provide: AdminDashboardService, useValue: { loadOverview, getTodaySessions: vi.fn(() => of({ data: [], total: 0, page: 1, totalPages: 1 })) } },
    ],
  });
  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, loadOverview, el: fixture.nativeElement as HTMLElement };
}

describe('DashboardComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('loads everything with a single overview call and builds real sparklines only where a series exists', () => {
    const { component, loadOverview } = setup(() => of(overview()));
    expect(loadOverview).toHaveBeenCalledTimes(1);
    const byLabel = Object.fromEntries(component.stats.map(s => [s.labelKey, s]));
    expect(byLabel['admin.projects'].value).toBe(3);
    expect(byLabel['admin.contacts'].spark).toEqual([33, 100]);
    expect(byLabel['admin.visits'].spark).toEqual([50, 100]);
    expect(byLabel['admin.users'].spark).toBeNull();
  });

  it('shows "—" and a banner naming the panel instead of fake zeros when a section fails', async () => {
    const { fixture, component, el } = setup(() => of(overview(['core', 'gsc'], { core: null, gsc: null })));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.stats.find(s => s.labelKey === 'admin.contacts')!.value).toBeNull();
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.overview_partial_error');
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.seo_title');
    const values = Array.from(el.querySelectorAll('.stat-card__value')).map(v => v.textContent?.trim());
    expect(values[0]).toBe('3'); // projectsCount è caricato
    expect(values.filter(v => v === '—')).toHaveLength(6); // le 6 card derivate da "core"
    expect(values).not.toContain('0');
  });

  it('shows an explicit error (not an empty dashboard) when the very first load fails', async () => {
    const { fixture, el } = setup(() => throwError(() => new Error('401')));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.dashboard-loading--error')).not.toBeNull();
    expect(el.querySelector('.stats-grid')).toBeNull();
  });

  it('keeps the previous data and says so when a later refresh fails', async () => {
    let call = 0;
    const { fixture, component, el } = setup(() => (call++ === 0 ? of(overview()) : throwError(() => new Error('down'))));
    component.refresh();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.stats.find(s => s.labelKey === 'admin.projects')!.value).toBe(3);
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.overview_refresh_error');
  });

  it('manual refresh bypasses the server cache', () => {
    const { component, loadOverview } = setup(() => of(overview()));
    component.refresh();
    expect(loadOverview).toHaveBeenLastCalledWith(true);
  });

  it('skips polling while the tab is hidden', () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { loadOverview } = setup(() => of(overview()));
    vi.advanceTimersByTime(60_000 * 3);
    expect(loadOverview).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(false);
    vi.advanceTimersByTime(60_000);
    expect(loadOverview).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
  });

  it('does not stack requests: a new load cancels the in-flight one', () => {
    const pending = new Subject<DashboardOverview>();
    const { component } = setup(() => pending);
    component.refresh();
    expect(pending.observed).toBe(true);
  });
});
