import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { AiQuotaService, AiQuotaStatus } from './ai-quota.service';
import { SKIP_CACHE_INTERCEPTOR } from '../interceptors/cache.interceptor';
import { SKIP_ERROR_TOAST } from '../interceptors/error.interceptor';

const STATUS: AiQuotaStatus = { limit: 30, used: 4, remaining: 26, resetsAt: '2026-11-11T00:00:00.000Z', unavailable: false };

function setup(platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PLATFORM_ID, useValue: platform }],
  });
  return { svc: TestBed.inject(AiQuotaService), ctrl: TestBed.inject(HttpTestingController) };
}

const isQuota = (r: { url: string }) => r.url.endsWith('/ai/quota');

describe('AiQuotaService', () => {
  it('parte senza stato e lo valorizza dopo refresh()', () => {
    const { svc, ctrl } = setup();
    expect(svc.status()).toBeNull();
    svc.refresh();
    ctrl.expectOne(isQuota).flush(STATUS);
    expect(svc.status()).toEqual(STATUS);
  });

  it('la lettura salta la cache GET e il toast d’errore', () => {
    const { svc, ctrl } = setup();
    svc.refresh();
    const req = ctrl.expectOne(isQuota);
    expect(req.request.context.get(SKIP_CACHE_INTERCEPTOR)).toBe(true);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    req.flush(STATUS);
  });

  it('se la richiesta fallisce non lancia e mantiene l’ultimo stato noto', () => {
    const { svc, ctrl } = setup();
    svc.refresh();
    ctrl.expectOne(isQuota).flush(STATUS);
    svc.refresh();
    ctrl.expectOne(isQuota).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(svc.status()).toEqual(STATUS);
  });

  it('un refresh in corso viene sostituito dal successivo: vale la risposta più recente', () => {
    const { svc, ctrl } = setup();
    svc.refresh();
    svc.refresh();
    const reqs = ctrl.match(isQuota);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].cancelled).toBe(true);
    reqs[1].flush({ ...STATUS, remaining: 3 });
    expect(svc.status()?.remaining).toBe(3);
  });

  it('lato server (SSR) non fa nessuna richiesta', () => {
    const { svc, ctrl } = setup('server');
    svc.refresh();
    ctrl.expectNone(isQuota);
    expect(svc.status()).toBeNull();
  });
});
