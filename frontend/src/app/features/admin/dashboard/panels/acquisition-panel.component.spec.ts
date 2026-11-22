import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AcquisitionPanelComponent, formatDuration, sortedSources, sourceKey } from './acquisition-panel.component';
import { AcquisitionReport, AdminDashboardService } from '../admin-dashboard.service';

const REPORT: AcquisitionReport = {
  days: 30,
  totalEntries: 12,
  sources: [{ label: 'search', count: 8 }, { label: 'direct', count: 4 }],
  referrers: [{ label: 'google.com', count: 7 }, { label: 'linkedin.com', count: 1 }],
  entryPages: [{ path: '/en/blog/rxjs-operators', entries: 6, sources: { direct: 1, search: 5 } }],
  recentVisits: [{
    at: '2026-11-22T10:15:00Z', trafficSource: 'search', referrerHost: 'google.com', utmSource: '',
    entryPath: '/en/blog/rxjs-operators', country: 'IT', city: 'Milano', deviceType: 'Mobile', pages: 3, durationSec: 95,
  }],
};

describe('AcquisitionPanelComponent', () => {
  function setup(get = vi.fn((_days: number) => of(REPORT))) {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: { getAcquisition: get } }],
    });
    const fixture = TestBed.createComponent(AcquisitionPanelComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, get };
  }

  it('carica gli ultimi 30 giorni e mostra siti di provenienza, pagine d\'ingresso e ultime visite', () => {
    const { el, get } = setup();
    expect(get).toHaveBeenCalledWith(30);
    const text = el.textContent ?? '';
    expect(text).toContain('google.com');
    expect(text).toContain('linkedin.com');
    expect(text).toContain('/en/blog/rxjs-operators');
    expect(text).toContain('Milano, IT');
    expect(text).toContain('1 min 35 s');
    expect(text).toContain('acquisition.source_search');
  });

  it('cambiando periodo ricarica i dati per quei giorni', () => {
    const { el, fixture, get } = setup();
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.acq__period'));
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    buttons[2].click();
    fixture.detectChanges();
    expect(get).toHaveBeenLastCalledWith(90);
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('se la richiesta fallisce mostra l\'errore', () => {
    const { el } = setup(vi.fn(() => throwError(() => new Error('500'))));
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('acquisition helpers', () => {
  it('le sorgenti sconosciute diventano "altro"', () => {
    expect(sourceKey('social')).toBe('acquisition.source_social');
    expect(sourceKey('qualcosa')).toBe('acquisition.source_other');
  });

  it('formatta la durata', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(120)).toBe('2 min');
    expect(formatDuration(95)).toBe('1 min 35 s');
  });

  it('ordina le sorgenti di una pagina dalla più frequente', () => {
    expect(sortedSources({ direct: 1, search: 5 })).toEqual([{ source: 'search', count: 5 }, { source: 'direct', count: 1 }]);
  });
});
