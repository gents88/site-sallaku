import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { UtilitySectionComponent, formatMemoryMb, formatUptimeHours } from './utility-section.component';
import { provideFeatureFlagsStub } from '../../../../../core/services/feature-flags.testing';

describe('UtilitySectionComponent', () => {
  it('le azioni rapide vanno al componente padre', () => {
    TestBed.configureTestingModule({
      imports: [UtilitySectionComponent, TranslateModule.forRoot()],
      providers: [provideNoopAnimations(), provideFeatureFlagsStub()],
    });
    const fixture = TestBed.createComponent(UtilitySectionComponent);
    fixture.componentRef.setInput('adminName', 'Gent');
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const calls = { refresh: vi.fn(), sessions: vi.fn(), csv: vi.fn(), reset: vi.fn() };
    c.refresh.subscribe(calls.refresh);
    c.loadSessions.subscribe(calls.sessions);
    c.downloadCsv.subscribe(calls.csv);
    c.resetMonthly.subscribe(calls.reset);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.utility-action-btn');
    buttons.forEach(b => b.click());
    expect(calls.refresh).toHaveBeenCalled();
    expect(calls.sessions).toHaveBeenCalled();
    expect(calls.csv).toHaveBeenCalled();
    expect(calls.reset).toHaveBeenCalled();
  });

  it('formatta uptime e memoria', () => {
    expect(formatUptimeHours(7200)).toBe('2h');
    expect(formatUptimeHours(null)).toBe('—');
    expect(formatMemoryMb(420)).toBe('420 MB');
    expect(formatMemoryMb(undefined)).toBe('—');
  });
});
