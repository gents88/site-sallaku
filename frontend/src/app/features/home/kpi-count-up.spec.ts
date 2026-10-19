import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { HERO_KPI_TARGETS, kpiCountUpValues, prefersReducedMotion } from './kpi-count-up';

describe('kpiCountUpValues', () => {
  it('parte da zero e arriva esattamente ai valori finali', () => {
    expect(kpiCountUpValues(HERO_KPI_TARGETS, 0)).toEqual([0, 0, 0, 0]);
    expect(kpiCountUpValues(HERO_KPI_TARGETS, 1)).toEqual([...HERO_KPI_TARGETS]);
  });

  it('è monotono e non supera mai il valore finale', () => {
    let prev = [0, 0, 0, 0];
    for (let p = 0; p <= 1.2; p += 0.05) {
      const cur = kpiCountUpValues(HERO_KPI_TARGETS, p);
      cur.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(prev[i]);
        expect(v).toBeLessThanOrEqual(HERO_KPI_TARGETS[i]);
      });
      prev = cur;
    }
  });

  it('limita il progresso fuori da 0..1', () => {
    expect(kpiCountUpValues(HERO_KPI_TARGETS, -3)).toEqual([0, 0, 0, 0]);
    expect(kpiCountUpValues(HERO_KPI_TARGETS, 7)).toEqual([...HERO_KPI_TARGETS]);
  });
});

function stubMatchMedia(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('prefersReducedMotion', () => {
  it('riflette la media query', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('HomeComponent — contatori KPI dell\'hero', () => {
  let ioCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void>;

  beforeEach(() => {
    ioCallbacks = [];
    class FakeIntersectionObserver {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { ioCallbacks.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    TestBed.configureTestingModule({
      imports: [HomeComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const kpiTexts = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.kpi-number')).map(n => (n.textContent ?? '').trim());

  it('il valore iniziale (SSR / prerender / no-JS) sono i numeri reali, non zeri', () => {
    stubMatchMedia(false);
    const fixture = TestBed.createComponent(HomeComponent);
    expect(fixture.componentInstance.kpiValues).toEqual([...HERO_KPI_TARGETS]);
  });

  it('con prefers-reduced-motion i numeri finali restano e non parte nessun conteggio', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    expect(kpiTexts(fixture.nativeElement)).toEqual(['8+', '20+', '4', '70%']);
  });

  it('senza reduced-motion conta da zero quando l\'hero entra in vista e termina sui valori finali', () => {
    stubMatchMedia(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.kpiValues).toEqual([0, 0, 0, 0]);

    // L'ultimo osservatore creato è quello dei KPI.
    ioCallbacks[ioCallbacks.length - 1]([{ isIntersecting: true }]);
    vi.advanceTimersByTime(2000);
    expect(fixture.componentInstance.kpiValues).toEqual([...HERO_KPI_TARGETS]);
  });

  it('se l\'osservatore non scatta mai, dopo il timeout di sicurezza i contatori non restano a zero', () => {
    stubMatchMedia(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.kpiValues).toEqual([0, 0, 0, 0]);
    vi.advanceTimersByTime(6100);
    expect(fixture.componentInstance.kpiValues).toEqual([...HERO_KPI_TARGETS]);
  });
});
