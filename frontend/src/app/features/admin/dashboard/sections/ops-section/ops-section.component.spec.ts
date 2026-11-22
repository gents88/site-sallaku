import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { OpsSectionComponent } from './ops-section.component';
import { provideFeatureFlagsStub } from '../../../../../core/services/feature-flags.testing';
import { AdminDashboardService, OverviewSection } from '../../admin-dashboard.service';

describe('OpsSectionComponent', () => {
  it('mostra le tre card operative con il periodo e inoltra "changed"', () => {
    TestBed.configureTestingModule({
      imports: [OpsSectionComponent, TranslateModule.forRoot()],
      providers: [provideFeatureFlagsStub(), { provide: AdminDashboardService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(OpsSectionComponent);
    fixture.componentRef.setInput('aiUsage', {
      date: '2026-11-22', tokens: 10, calls: 1, history: [], enabled: true,
      quota: { dailyTokenBudget: 1000, maxCallsPerIpPerDay: 30 },
    });
    fixture.componentRef.setInput('serverErrors', { open: 0, today: 0, week: 0, recent: [] });
    fixture.componentRef.setInput('failed', new Set<OverviewSection>(['aiUsage', 'serverHealth']));
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(titles).toEqual(['ai_usage.title', 'server_errors.title', 'server_health.title']);
    expect(el.textContent).toContain('dashboard_ux.period_today');
    fixture.componentInstance.changed.emit();
    expect(changed).toHaveBeenCalled();
  });
});
