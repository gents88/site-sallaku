import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminDashboardService, normalizeOverview } from './admin-dashboard.service';
import { environment } from '../../../../environments/environment';

describe('normalizeOverview', () => {
  it('passes through loaded sections and reports no failures', () => {
    const res = normalizeOverview({
      generatedAt: 'now',
      errors: [],
      sections: { projectsCount: 4, systemHealth: null, systemDetails: null, systemOps: null } as never,
    });
    expect(res.data.projectsCount).toBe(4);
    // Le sezioni non presenti nella risposta contano come fallite.
    expect(res.failed.has('projectsCount')).toBe(false);
    expect(res.failed.has('core')).toBe(true);
  });

  it('marks a section listed in errors as failed and fills an empty default, not undefined', () => {
    const res = normalizeOverview({
      generatedAt: 'now',
      errors: ['chatbotStats'],
      sections: { chatbotStats: null } as never,
    });
    expect(res.failed.has('chatbotStats')).toBe(true);
    expect(res.data.chatbotStats.totalSessions).toBe(0);
  });

  it('accepts a legitimate null for the system sections when the server did not flag them', () => {
    const res = normalizeOverview({ generatedAt: 'now', errors: [], sections: { systemHealth: null } as never });
    expect(res.failed.has('systemHealth')).toBe(false);
  });

  it('la sezione security mancante conta come fallita e ha un default vuoto', () => {
    const res = normalizeOverview({ generatedAt: 'now', errors: [], sections: {} as never });
    expect(res.failed.has('security')).toBe(true);
    expect(res.data.security).toEqual(expect.objectContaining({ activeSessions: 0, sessions: [], events: [], suspiciousIps: [] }));
  });

  it('treats an unexpected null in a non-nullable section as failed', () => {
    const res = normalizeOverview({ generatedAt: 'now', errors: [], sections: { topPages: null } as never });
    expect(res.failed.has('topPages')).toBe(true);
    expect(res.data.topPages).toEqual([]);
  });
});

describe('AdminDashboardService.loadOverview', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(AdminDashboardService), http: TestBed.inject(HttpTestingController) };
  }

  it('makes ONE request for the whole dashboard', () => {
    const { service, http } = setup();
    service.loadOverview().subscribe();
    http.expectOne(`${environment.apiUrl}/stats/overview`).flush({ generatedAt: 'x', sections: {}, errors: [] });
  });

  it('asks the server to bypass its cache on a manual refresh', () => {
    const { service, http } = setup();
    service.loadOverview(true).subscribe();
    http.expectOne(`${environment.apiUrl}/stats/overview?fresh=1`).flush({ generatedAt: 'x', sections: {}, errors: [] });
  });

  it('revokeSession chiude la sessione di un utente con una POST sull’endpoint sicurezza', () => {
    const { service, http } = setup();
    service.revokeSession('u2').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/security/sessions/u2/revoke`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
});
