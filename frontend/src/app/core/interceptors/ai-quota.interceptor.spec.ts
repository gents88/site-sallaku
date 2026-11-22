import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, vi } from 'vitest';
import { environment } from '@env/environment';
import { aiQuotaInterceptor } from './ai-quota.interceptor';
import { AiQuotaService } from '../services/ai-quota.service';

function setup() {
  const refresh = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([aiQuotaInterceptor])),
      provideHttpClientTesting(),
      { provide: AiQuotaService, useValue: { refresh } },
    ],
  });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController), refresh };
}

const AI = `${environment.apiUrl}/ai`;

describe('aiQuotaInterceptor', () => {
  it('rilegge la quota dopo un POST /ai/* riuscito', () => {
    const { http, ctrl, refresh } = setup();
    http.post(`${AI}/format-text`, {}).subscribe();
    expect(refresh).not.toHaveBeenCalled();
    ctrl.expectOne(`${AI}/format-text`).flush({});
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('la rilegge anche se la chiamata fallisce (il server ha già contato la richiesta, anche un 429)', () => {
    const { http, ctrl, refresh } = setup();
    http.post(`${AI}/summarize-file`, {}).subscribe({ error: () => {} });
    ctrl.expectOne(`${AI}/summarize-file`).flush({}, { status: 429, statusText: 'Too Many Requests' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignora i GET (compreso /ai/quota stesso: niente ciclo) e le altre API', () => {
    const { http, ctrl, refresh } = setup();
    http.get(`${AI}/quota`).subscribe();
    ctrl.expectOne(`${AI}/quota`).flush({});
    http.post(`${environment.apiUrl}/contact`, {}).subscribe();
    ctrl.expectOne(`${environment.apiUrl}/contact`).flush({});
    expect(refresh).not.toHaveBeenCalled();
  });
});
