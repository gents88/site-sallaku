import { TestBed } from '@angular/core/testing';
import { importProvidersFrom, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QrCodeComponent } from './qr-code.component';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LanguageService } from '../../../core/services/language.service';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';

function create(): QrCodeComponent {
  TestBed.configureTestingModule({
    providers: [
      importProvidersFrom(TranslateModule.forRoot()),
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
      { provide: WorkspaceService, useValue: { send: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: LanguageService, useValue: { current: signal('it') } },
      { provide: LabInfoService, useValue: { page: () => ({ id: 'qr-code', titleKey: 'a', descriptionKey: 'b', labelKey: 'c', path: '/lab/qr-code' }), appFields: () => ({}), faqSchemas: () => [] } },
    ],
  });
  return TestBed.runInInjectionContext(() => new QrCodeComponent());
}

describe('QrCodeComponent', () => {
  let c: QrCodeComponent;
  beforeEach(() => { c = create(); });

  it('senza dati non c\'è nessun codice e nessun errore', () => {
    expect(c.payload()).toBe('');
    expect(c.built()).toEqual({ matrix: null, tooLong: false });
    expect(c.svg()).toBe('');
    expect(c.previewUrl()).toBeNull();
  });

  it('un link genera un codice con matrice e anteprima', () => {
    c.setField('url', 'esempio.it');
    expect(c.payload()).toBe('https://esempio.it');
    expect(c.modules()).toBeGreaterThanOrEqual(21);
    expect((c.modules() - 17) % 4).toBe(0); // 21, 25, 29… : 17 + 4·versione
    expect(c.svg()).toContain('<svg');
    expect(c.previewUrl()).not.toBeNull();
  });

  it('cambiando tipo si usano i campi di quel tipo', () => {
    c.setField('ssid', 'Casa');
    c.setField('password', 'segreta');
    c.setType('wifi');
    expect(c.payload()).toBe('WIFI:T:WPA;S:Casa;P:segreta;;');
    c.setSecurity('nopass');
    expect(c.payload()).toBe('WIFI:T:nopass;S:Casa;;');
    c.setHidden(true);
    expect(c.payload()).toContain('H:true;');
  });

  it('un contenuto troppo lungo dà un errore gestito, non un\'eccezione', () => {
    c.setType('text');
    c.setField('text', 'x'.repeat(6000));
    expect(c.built().tooLong).toBe(true);
    expect(c.built().matrix).toBeNull();
    expect(c.previewUrl()).toBeNull();
  });

  it('la stessa quantità di testo entra con una correzione errori più bassa', () => {
    c.setType('text');
    c.setField('text', 'y'.repeat(2500));
    c.setEc('H');
    const high = c.built().tooLong;
    c.setEc('L');
    expect(high).toBe(true);
    expect(c.built().tooLong).toBe(false);
  });

  it('accenti ed emoji non rompono la generazione', () => {
    c.setType('text');
    c.setField('text', 'Caffè ☕ — città, perché? 日本語');
    expect(c.built().matrix).not.toBeNull();
  });

  it('i colori: avvisi, scambio e ripristino', () => {
    c.setFg('#888888');
    c.setBg('#999999');
    expect(c.warning()).toBe('low-contrast');
    c.resetColors();
    expect(c.warning()).toBeNull();
    c.swapColors();
    expect(c.fg()).toBe('#ffffff');
    expect(c.warning()).toBe('inverted');
  });

  it('un colore non valido non produce un SVG', () => {
    c.setField('url', 'a.it');
    c.setFg('rosso');
    expect(c.svg()).toBe('');
  });

  it('il margine resta tra 0 e 10 e la dimensione PNG usa moduli interi', () => {
    c.setMargin('99');
    expect(c.margin()).toBe(10);
    c.setMargin('-3');
    expect(c.margin()).toBe(0);
    c.setMargin('4');
    c.setField('url', 'a.it');
    c.setPngSize('1024');
    const info = c.pngInfo()!;
    expect(info.side).toBeLessThanOrEqual(1024);
    expect(info.side % info.module).toBe(0);
  });
});
