import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LeadAttributionPanelComponent, leadKindKey } from './lead-attribution-panel.component';
import { AdminDashboardService, LeadAttributionReport } from '../admin-dashboard.service';

const REPORT: LeadAttributionReport = {
  days: 30,
  totalLeads: 4,
  previousTotalLeads: 2,
  byKind: [{ label: 'contact_form', count: 3 }, { label: 'live_handoff', count: 1 }],
  bySource: [{ label: 'search', count: 3 }, { label: 'social', count: 1 }],
  byReferrer: [{ label: 'google.com', count: 3 }],
  byEntryPage: [{ label: '/en/blog/rxjs-operators', count: 2 }],
  articles: [{ path: '/en/blog/rxjs-operators', leads: 2, visitors: 40, rate: 5 }],
};

describe('LeadAttributionPanelComponent', () => {
  function setup(get = vi.fn((_days: number) => of(REPORT))) {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: { getLeadAttribution: get } }],
    });
    const fixture = TestBed.createComponent(LeadAttributionPanelComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, get };
  }

  it('mostra contatti, confronto, provenienze e articoli che portano contatti', () => {
    const { el, get } = setup();
    expect(get).toHaveBeenCalledWith(30);
    const text = el.textContent ?? '';
    expect(text).toContain('+100%');
    expect(text).toContain('lead_attribution.kind_contact_form');
    expect(text).toContain('acquisition.source_search');
    expect(text).toContain('google.com');
    expect(text).toContain('/en/blog/rxjs-operators');
    expect(text).toContain('5%');
  });

  it('senza contatti nel periodo mostra il messaggio vuoto', () => {
    const { el } = setup(vi.fn(() => of({ ...REPORT, totalLeads: 0, byKind: [], bySource: [], byReferrer: [], byEntryPage: [], articles: [] })));
    expect(el.textContent).toContain('lead_attribution.empty');
  });

  it('cambiando periodo ricarica per quei giorni', () => {
    const { el, fixture, get } = setup();
    el.querySelectorAll<HTMLButtonElement>('.periods__btn')[0].click();
    fixture.detectChanges();
    expect(get).toHaveBeenLastCalledWith(7);
  });

  it('se la richiesta fallisce mostra l\'errore', () => {
    const { el } = setup(vi.fn(() => throwError(() => new Error('500'))));
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('leadKindKey', () => {
  it('traduce i tipi noti e raggruppa gli altri', () => {
    expect(leadKindKey('live_handoff')).toBe('lead_attribution.kind_live_handoff');
    expect(leadKindKey('boh')).toBe('lead_attribution.kind_other');
  });
});
