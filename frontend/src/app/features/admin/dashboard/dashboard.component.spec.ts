import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardComponent } from './dashboard.component';
import { AdminDashboardService, DashboardOverview, OverviewSection, normalizeOverview } from './admin-dashboard.service';
import { AuthService } from '../../../core/services/auth.service';
import { provideFeatureFlagsStub } from '../../../core/services/feature-flags.testing';

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

async function setup(load: AdminDashboardService['loadOverview'], sections: AdminDashboardService['loadSections'] = () => of({ data: {}, requested: new Set<OverviewSection>(), failed: new Set<OverviewSection>() })) {
  const loadOverview = vi.fn(load);
  const loadSections = vi.fn(sections);
  TestBed.configureTestingModule({
    imports: [DashboardComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      provideFeatureFlagsStub(),
      { provide: AuthService, useValue: { currentUser: signal(null), isAdmin: signal(true), logout: vi.fn() } },
      { provide: AdminDashboardService, useValue: { loadOverview, loadSections, getTodaySessions: vi.fn(() => of({ data: [], total: 0, page: 1, totalPages: 1 })), getAcquisition: vi.fn(() => of({ days: 30, totalEntries: 0, previousTotalEntries: 0, sources: [], referrers: [], entryPages: [], recentVisits: [] })), getLeadAttribution: vi.fn(() => of({ days: 30, totalLeads: 0, previousTotalLeads: 0, byKind: [], bySource: [], byReferrer: [], byEntryPage: [], articles: [] })) } },
    ],
  });
  // Le sezioni in @defer hanno dipendenze caricate a parte: vanno compilate prima.
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, loadOverview, loadSections, el: fixture.nativeElement as HTMLElement };
}

describe('DashboardComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('loads everything with a single overview call and builds real sparklines only where a series exists', async () => {
    const { component, loadOverview } = await setup(() => of(overview()));
    expect(loadOverview).toHaveBeenCalledTimes(1);
    const byLabel = Object.fromEntries(component.stats.map(s => [s.labelKey, s]));
    expect(byLabel['admin.projects'].value).toBe(3);
    expect(byLabel['admin.contacts'].spark).toEqual([33, 100]);
    expect(byLabel['admin.visits'].spark).toEqual([50, 100]);
    expect(byLabel['admin.users'].spark).toBeNull();
  });

  it('shows "—" and a banner naming the panel instead of fake zeros when a section fails', async () => {
    const { fixture, component, el } = await setup(() => of(overview(['core', 'gsc'], { core: null, gsc: null })));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.stats.find(s => s.labelKey === 'admin.contacts')!.value).toBeNull();
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.overview_partial_error');
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.seo_title');
    const values = Array.from(el.querySelectorAll('.stat-card__value')).map(v => v.textContent?.trim());
    expect(values[0]).toBe('3'); // projectsCount è caricato
    expect(values.filter(v => v === '—')).toHaveLength(7); // le 7 card derivate da "core" (bozze inclusa)
    expect(values).not.toContain('0');
  });

  it('shows an explicit error (not an empty dashboard) when the very first load fails', async () => {
    const { fixture, el } = await setup(() => throwError(() => new Error('401')));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.dashboard-loading--error')).not.toBeNull();
    expect(el.querySelector('.stats-grid')).toBeNull();
  });

  it('keeps the previous data and says so when a later refresh fails', async () => {
    let call = 0;
    const { fixture, component, el } = await setup(() => (call++ === 0 ? of(overview()) : throwError(() => new Error('down'))));
    component.refresh();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.stats.find(s => s.labelKey === 'admin.projects')!.value).toBe(3);
    expect(el.querySelector('.dashboard-error')?.textContent).toContain('admin.overview_refresh_error');
  });

  it('has a "Drafts" card that opens the blog list filtered on drafts', async () => {
    const { component, el } = await setup(() => of(overview()));
    const drafts = component.stats.find(s => s.labelKey === 'admin.drafts')!;
    expect(drafts.value).toBe(1);
    expect(drafts.query).toEqual({ status: 'draft' });
    const links = Array.from(el.querySelectorAll('a.stat-card')).map(a => a.getAttribute('href'));
    expect(links).toContain('/dashboard/blog?status=draft');
  });

  it('manual refresh bypasses the server cache', async () => {
    const { component, loadOverview } = await setup(() => of(overview()));
    component.refresh();
    expect(loadOverview).toHaveBeenLastCalledWith(true);
  });

  it('skips polling while the tab is hidden', async () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { loadOverview, loadSections } = await setup(() => of(overview()));
    vi.advanceTimersByTime(60_000 * 3);
    expect(loadOverview).toHaveBeenCalledTimes(1);
    expect(loadSections).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    vi.advanceTimersByTime(60_000);
    expect(loadSections).toHaveBeenCalledTimes(1);
    hidden.mockRestore();
  });

  it('il polling ricarica ogni minuto solo le sezioni vive e tutto ogni 10 minuti', async () => {
    vi.useFakeTimers();
    const { loadOverview, loadSections } = await setup(() => of(overview()));
    vi.advanceTimersByTime(60_000);
    expect(loadSections).toHaveBeenCalledTimes(1);
    expect(loadSections.mock.calls[0][0]).toEqual(expect.arrayContaining(['core', 'liveHandoffs', 'serverErrors']));
    expect(loadOverview).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000 * 9);
    expect(loadOverview).toHaveBeenCalledTimes(2);
  });

  it('un aggiornamento parziale sostituisce solo le sezioni ricevute', async () => {
    vi.useFakeTimers();
    const partial = {
      data: { liveHandoffs: [{ requestId: 'r1', status: 'requested', requestedAt: '2026-11-22T10:00:00Z' }] } as never,
      requested: new Set(['liveHandoffs', 'serverErrors']) as never,
      failed: new Set(['serverErrors']) as never,
    };
    const { component } = await setup(() => of(overview()), () => of(partial));
    vi.advanceTimersByTime(60_000);
    expect(component.liveHandoffs).toHaveLength(1);
    // Il resto dello snapshot resta quello di prima.
    expect(component.stats.find(s => s.labelKey === 'admin.projects')!.value).toBe(3);
    expect(component.isFailed('serverErrors')).toBe(true);
  });

  it('l\'indice porta alle sezioni e mostra la SEO solo se Search Console è configurato', async () => {
    const { component, el } = await setup(() => of(overview()));
    const ids = component.navItems.map(i => i.id);
    expect(ids).toContain('dash-visitors');
    expect(ids).not.toContain('dash-seo');
    expect(el.querySelectorAll('.dash-nav__link').length).toBe(ids.length);
    for (const id of ids.filter(i => i !== 'dash-messages')) {
      expect(el.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it('does not stack requests: a new load cancels the in-flight one', async () => {
    const pending = new Subject<DashboardOverview>();
    const { component } = await setup(() => pending);
    component.refresh();
    expect(pending.observed).toBe(true);
  });
});
