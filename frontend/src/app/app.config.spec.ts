import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { TRANSLATE_LOADER_OPTIONS } from './app.config';

describe('loader delle traduzioni', () => {
  function loadItalian(): string {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ loader: provideTranslateHttpLoader(TRANSLATE_LOADER_OPTIONS) }),
      ],
    });
    TestBed.inject(TranslateService).use('it').subscribe();
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((r) => r.url.startsWith('/i18n/it.json'));
    const url = req.request.urlWithParams;
    req.flush({});
    return url;
  }

  it('richiede il file con la versione della release, non con un timestamp', () => {
    const url = loadItalian();
    expect(url).toMatch(/^\/i18n\/it\.json\?v=.+/);
    expect(url).not.toContain('enforceLoading');
  });

  it('usa lo stesso URL a ogni visita, così la cache del browser funziona', () => {
    const first = loadItalian();
    TestBed.resetTestingModule();
    const second = loadItalian();
    expect(second).toBe(first);
  });
});
