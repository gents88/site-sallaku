import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageService, STORAGE_KEY } from './language.service';

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
  });

  afterEach(() => {
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
});
