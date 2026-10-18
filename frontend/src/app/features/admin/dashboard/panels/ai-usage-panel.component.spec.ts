import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AiUsagePanelComponent, budgetLevel, budgetPct } from './ai-usage-panel.component';
import { AiUsageOverview } from '../admin-dashboard.service';
import { DEFAULT_FEATURE_FLAGS, FeatureFlags, FeatureFlagsService } from '../../../../core/services/feature-flags.service';

const DATA: AiUsageOverview = {
  date: '2026-10-17',
  tokens: 250_000,
  calls: 12,
  byEndpoint: [{ endpoint: 'summarize-file', calls: 9 }, { endpoint: 'format-text', calls: 3 }],
  tokensBySource: { tools: 200_000, chatbot: 50_000 },
  rejectedIpCap: 2,
  rejectedBudget: 0,
  cappedIps: 1,
  history: [
    { date: '2026-10-16', tokens: 100, calls: 1 },
    { date: '2026-10-17', tokens: 250_000, calls: 12 },
  ],
  quota: { dailyTokenBudget: 300_000, maxCallsPerIpPerDay: 30 },
  enabled: true,
};

describe('budgetLevel / budgetPct', () => {
  it('warns from 80% and goes red at the budget', () => {
    expect(budgetLevel(100, 1000)).toBe('ok');
    expect(budgetLevel(800, 1000)).toBe('warn');
    expect(budgetLevel(1000, 1000)).toBe('bad');
    expect(budgetLevel(5, 0)).toBe('ok');
    expect(budgetPct(1500, 1000)).toBe(100);
    expect(budgetPct(250, 1000)).toBe(25);
  });
});

describe('AiUsagePanelComponent', () => {
  function setup(update: () => unknown = () => of(DEFAULT_FEATURE_FLAGS), failed = false) {
    const flags = signal<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });
    const service = { flags, update: vi.fn(update) };
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: FeatureFlagsService, useValue: service }],
    });
    const fixture = TestBed.createComponent(AiUsagePanelComponent);
    fixture.componentInstance.data = DATA;
    fixture.componentInstance.failed = failed;
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, service };
  }

  it('shows tokens against the budget with a warning meter, per-tool calls and blocked counts', () => {
    const { el } = setup();
    expect(el.textContent).toContain('250,000 / 300,000');
    expect(el.querySelector('.panel-meter--warn')).not.toBeNull();
    expect(el.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('83');
    expect(el.textContent).toContain('summarize-file');
    expect(el.querySelectorAll('.panel-spark span').length).toBe(2);
  });

  it('turns AI off through the feature flag and restores the switch if saving fails', () => {
    const result = new Subject<FeatureFlags>();
    const { el, service } = setup(() => result);
    const sw = el.querySelector('#ai-kill-switch') as HTMLInputElement;
    expect(sw.checked).toBe(true);

    sw.checked = false;
    sw.dispatchEvent(new Event('change'));
    expect(service.update).toHaveBeenCalledWith({ aiEnabled: false });

    result.error(new Error('500'));
    expect(sw.checked).toBe(true);
  });

  it('shows only an error when the section failed to load', () => {
    const { el } = setup(undefined, true);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('#ai-kill-switch')).toBeNull();
  });
});
