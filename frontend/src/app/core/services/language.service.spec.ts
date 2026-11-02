import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageService, STORAGE_KEY } from './language.service';
import { translationUrl } from '../i18n/translate-loader-options';

/** Lets pending microtask chains (fetch().then().then()) settle before assertions. */
const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('LanguageService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function mockIpCountry(countryCode: string | null): void {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve(countryCode ? { country_code: countryCode } : {}),
    });
  }

  function mockIpFailure(): void {
    fetchMock.mockRejectedValue(new Error('network unavailable'));
  }

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { url: '/', navigateByUrl: vi.fn().mockResolvedValue(true) } },
        {
          provide: TranslateService,
          useValue: { addLangs: vi.fn(), reloadLang: vi.fn(() => of(null)), use: vi.fn(() => of(null)) },
        },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  }

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // jsdom/this vitest environment doesn't implement matchMedia; ThemeService
    // (a sibling dependency pulled in via LanguageService's DI graph) calls it
    // on construction.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    // La ricerca per IP all'avvio viene rimandata a "browser libero"; jsdom non
    // ha requestIdleCallback, quindi nei test parte subito (il rinvio ha il suo
    // test dedicato più sotto).
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 });
      return 0;
    }) as typeof window.requestIdleCallback;
  });

  afterEach(() => {
    delete (window as { requestIdleCallback?: unknown }).requestIdleCallback;
    document.head.querySelectorAll('link[rel="preload"][as="fetch"]').forEach((l) => l.remove());
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects Albania via IP geolocation and sets Albanian (sq)', async () => {
    mockIpCountry('AL');
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(service.current()).toBe('sq');
  });

  it('detects Kosovo via IP geolocation and sets Albanian (sq)', async () => {
    mockIpCountry('XK');
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(service.current()).toBe('sq');
  });

  it('falls back to English when the detected country has no supported language', async () => {
    mockIpCountry('JP');
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(service.current()).toBe('en');
  });

  it('uses navigator.language when IP geolocation is unavailable', async () => {
    mockIpFailure();
    vi.stubGlobal('navigator', { ...navigator, language: 'de-DE' });
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(service.current()).toBe('de');
  });

  it('falls back to English when geolocation fails and the device locale is unsupported', async () => {
    mockIpFailure();
    vi.stubGlobal('navigator', { ...navigator, language: 'ja-JP' });
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(service.current()).toBe('en');
  });

  it('does not call the IP lookup when a preference is already stored', async () => {
    localStorage.setItem(STORAGE_KEY, 'fr');
    configure();
    const service = TestBed.inject(LanguageService);

    await flushAsync();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(service.current()).toBe('fr');
  });

  it('forceLanguage() overrides detection and persists the choice', async () => {
    mockIpCountry('AL');
    configure();
    const service = TestBed.inject(LanguageService);
    await flushAsync();
    expect(service.current()).toBe('sq');

    service.forceLanguage('it');

    expect(service.current()).toBe('it');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('it');
  });

  it('resetLanguagePreference() clears the stored choice and re-runs detection', async () => {
    mockIpCountry('AL');
    configure();
    const service = TestBed.inject(LanguageService);
    await flushAsync();
    service.forceLanguage('it');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('it');

    mockIpCountry('XK');
    service.resetLanguagePreference();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    await flushAsync();
    expect(service.current()).toBe('sq');
  });

  it('simulateCountry() applies the mapped language without persisting', () => {
    mockIpCountry(null);
    configure();
    const service = TestBed.inject(LanguageService);

    service.simulateCountry('al');

    expect(service.current()).toBe('sq');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  describe('ricerca per IP all\'avvio', () => {
    it('non parte durante la costruzione: aspetta che il browser sia libero', async () => {
      mockIpCountry('AL');
      let idleTask: (() => void) | undefined;
      window.requestIdleCallback = ((cb: IdleRequestCallback) => {
        idleTask = () => cb({ didTimeout: false, timeRemaining: () => 50 });
        return 0;
      }) as typeof window.requestIdleCallback;
      configure();
      const service = TestBed.inject(LanguageService);
      await flushAsync();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(service.current()).not.toBe('sq');

      idleTask?.();
      await flushAsync();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(service.current()).toBe('sq');
    });

    it('rinuncia se nel frattempo l\'utente ha scelto una lingua', async () => {
      mockIpCountry('AL');
      let idleTask: (() => void) | undefined;
      window.requestIdleCallback = ((cb: IdleRequestCallback) => {
        idleTask = () => cb({ didTimeout: false, timeRemaining: () => 50 });
        return 0;
      }) as typeof window.requestIdleCallback;
      configure();
      const service = TestBed.inject(LanguageService);
      service.forceLanguage('de');

      idleTask?.();
      await flushAsync();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(service.current()).toBe('de');
    });

    it('il ripristino manuale non viene rimandato', async () => {
      mockIpCountry('XK');
      window.requestIdleCallback = (() => 0) as typeof window.requestIdleCallback; // non scatta mai
      configure();
      const service = TestBed.inject(LanguageService);
      service.forceLanguage('it');

      service.resetLanguagePreference();
      await flushAsync();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(service.current()).toBe('sq');
    });
  });

  describe('preload delle traduzioni nell\'HTML prerenderizzato', () => {
    function configureFor(platform: 'server' | 'browser'): void {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: Router, useValue: { url: '/', navigateByUrl: vi.fn().mockResolvedValue(true) } },
          {
            provide: TranslateService,
            useValue: { addLangs: vi.fn(), reloadLang: vi.fn(() => of(null)), use: vi.fn(() => of(null)) },
          },
          { provide: PLATFORM_ID, useValue: platform },
        ],
      });
    }
    const preloads = () => document.head.querySelectorAll('link[rel="preload"][as="fetch"]');

    it('lato server aggiunge il preload dello stesso URL che userà il loader', () => {
      configureFor('server');
      TestBed.inject(LanguageService).setLangFromUrl('en', true).subscribe();

      expect(preloads()).toHaveLength(1);
      const link = preloads()[0];
      expect(link.getAttribute('href')).toBe(translationUrl('en'));
      expect(link.getAttribute('crossorigin')).toBe('anonymous');
    });

    it('non duplica il link se la lingua viene impostata due volte', () => {
      configureFor('server');
      const service = TestBed.inject(LanguageService);
      service.setLangFromUrl('de', true).subscribe();
      service.setLangFromUrl('de', true).subscribe();

      expect(preloads()).toHaveLength(1);
    });

    it('nel browser non tocca il head', () => {
      mockIpCountry(null); // nel browser parte anche la ricerca per IP: serve una risposta
      configureFor('browser');
      TestBed.inject(LanguageService).setLangFromUrl('en', true).subscribe();

      expect(preloads()).toHaveLength(0);
    });
  });
});
