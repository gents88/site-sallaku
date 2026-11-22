import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { VisitorStats, VisitorsSectionComponent } from './visitors-section.component';

const STATS: VisitorStats = {
  totalViews: 500, monthlyViews: 80, lastResetAt: null, todayVisitors: 4, uniqueVisitors: 200,
  statsLocations: [{ label: 'IT', count: 300 }], statsMonthlyLocations: [{ label: 'IT', count: 50 }],
  statsDevices: [{ label: 'Mobile', count: 280 }], statsMonthlyDevices: [{ label: 'Mobile', count: 40 }],
  osBreakdown: [], trafficSources: [], topLocations: [{ label: 'Milano, IT', count: 90 }], topCountries: [{ label: 'IT', count: 300 }],
  browserBreakdown: [{ label: 'Chrome', count: 250 }],
  trend: [{ month: '2026-10', views: 60 }, { month: '2026-11', views: 80 }],
  chatbotStats: { totalSessions: 1, totalMessages: 2, interactionsToday: 0, sessionsThisMonth: 1, fallbackRepliesToday: 0 },
  topPages: [{ label: '/blog', count: 40 }],
  toolConversion: [{ tool: 'pdf-search', uniqueVisitors: 10, becameLead: 1, conversionRate: 10 }],
};

describe('VisitorsSectionComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [VisitorsSectionComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(VisitorsSectionComponent);
    fixture.componentRef.setInput('stats', STATS);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('distingue la card dei paesi (mese e totale) da quella delle città', () => {
    const { el } = setup();
    const titles = Array.from(el.querySelectorAll('app-dashboard-card h2')).map(h => h.textContent?.trim());
    expect(titles).toContain('dashboard_ux.countries_month_total');
    expect(titles).toContain('dashboard_ux.cities_title');
    expect(titles).not.toContain('admin.top_locations');
    expect(el.textContent).toContain('Milano, IT');
  });

  it('il mese corrente dell\'andamento è evidenziato', () => {
    const { el } = setup();
    expect(el.querySelectorAll('.h-bar-fill--current').length).toBe(1);
    expect(el.querySelectorAll('.h-bar-fill--past').length).toBe(1);
  });

  it('azzeramento mensile ed export CSV vanno al componente padre', () => {
    const { el, fixture } = setup();
    const reset = vi.fn();
    const csv = vi.fn();
    fixture.componentInstance.resetMonthly.subscribe(reset);
    fixture.componentInstance.downloadCsv.subscribe(csv);
    const [resetBtn, csvBtn] = Array.from(el.querySelectorAll<HTMLButtonElement>('.reset-stats-btn'));
    resetBtn.click();
    csvBtn.click();
    expect(reset).toHaveBeenCalled();
    expect(csv).toHaveBeenCalled();
  });
});
