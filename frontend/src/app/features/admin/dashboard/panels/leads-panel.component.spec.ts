import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { LeadsPanelComponent, followUpLabel } from './leads-panel.component';
import { LeadStats } from '../admin-dashboard.service';

const NOW = new Date('2026-10-17T15:00:00');

describe('followUpLabel', () => {
  it('today for a reminder later today, overdue for a past day', () => {
    expect(followUpLabel(new Date('2026-10-17T09:00:00').toISOString(), NOW)).toBe('today');
    expect(followUpLabel(new Date('2026-10-15T09:00:00').toISOString(), NOW)).toBe('overdue');
  });
});

describe('LeadsPanelComponent', () => {
  function render(data: LeadStats) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LeadsPanelComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const DATA: LeadStats = {
    byStatus: { new: 4, in_progress: 2, won: 3, lost: 1 },
    avgFirstResponseHours: 5.5,
    winRate: 75,
    followUpsDue: 7,
    followUps: [{ _id: 'c1', name: 'Luca', subject: 'Preventivo sito', followUpAt: '2026-10-10T07:00:00Z', status: 'in_progress' }],
  };

  it('links each pipeline stage to the filtered inbox and shows the KPIs', () => {
    const el = render(DATA);
    const stages = el.querySelectorAll('a.panel-kpi');
    expect(stages).toHaveLength(4);
    expect(stages[1].getAttribute('href')).toBe('/dashboard/contacts?status=in_progress');
    expect(el.textContent).toContain('5.5 h');
    expect(el.textContent).toContain('75%');
  });

  it('lists due follow-ups and offers the full list when there are more', () => {
    const el = render(DATA);
    expect(el.textContent).toContain('Luca');
    expect(el.querySelector('.panel-badge--bad')).not.toBeNull();
    expect(el.querySelector('.panel-actions a')?.getAttribute('href')).toBe('/dashboard/contacts?followups=1');
  });

  it('shows dashes when there is no data yet', () => {
    const el = render({ ...DATA, avgFirstResponseHours: null, winRate: null, followUpsDue: 0, followUps: [] });
    expect(el.textContent).toContain('leads.no_replies');
    expect(el.textContent).toContain('leads.followups_none');
  });
});
