import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { ThemeService, type LanguageAccent } from './theme.service';

export type Lang = 'it' | 'en' | 'sq' | 'es' | 'pt' | 'fr' | 'de';

export const SUPPORTED_LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'sq', label: 'Shqip',      flag: '🇦🇱' },
  { code: 'es', label: 'Español',    flag: '🇪🇸' },
  { code: 'pt', label: 'Português',  flag: '🇵🇹' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪' },
];

const STORAGE_KEY = 'gs-portfolio-lang';

/** Country codes (ISO 3166-1 alpha-2) mapped to supported languages */
const COUNTRY_LANG_MAP: Record<string, Lang> = {
  AL: 'sq', // Albania
  XK: 'sq', // Kosovo
  IT: 'it', // Italy
  ES: 'es', // Spain
  MX: 'es', // Mexico
  AR: 'es', // Argentina
  CO: 'es', // Colombia
  PT: 'pt', // Portugal
  BR: 'pt', // Brazil
  FR: 'fr', // France
  BE: 'fr', // Belgium
  CH: 'fr', // Switzerland (default to French)
  DE: 'de', // Germany
  AT: 'de', // Austria
};

const ALL_LANGS: Lang[] = ['it', 'en', 'sq', 'es', 'pt', 'fr', 'de'];

export function resolveInitialLanguage(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && ALL_LANGS.includes(stored)) {
      return stored;
    }
  }

  if (typeof navigator !== 'undefined') {
    const browser = navigator.language.slice(0, 2) as Lang;
    if (ALL_LANGS.includes(browser)) {
      return browser;
    }
  }

  return 'en';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _current = signal<Lang>(resolveInitialLanguage());
  private readonly themeService = inject(ThemeService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly doc = inject(DOCUMENT);

  readonly current = this._current.asReadonly();
  readonly supported = SUPPORTED_LANGS;

  constructor(private translate: TranslateService) {
    this.translate.addLangs(ALL_LANGS);
    if (isPlatformBrowser(this.platformId)) {
      this.doc.documentElement.lang = this._current();
      this.detectLanguageFromIP();
    }
    this.applyLanguageAccent(this._current());
  }

  /**
   * On first visit (no stored preference), detect the user's country via a
   * free IP-geolocation API and set the appropriate default language.
   * Albania / Kosovo → sq | Italy → it | everything else → en
   */
  private detectLanguageFromIP(): void {
    if (typeof localStorage === 'undefined') return;
    // Respect an explicit user choice stored from a previous visit
    if (localStorage.getItem(STORAGE_KEY)) return;

    fetch('https://ipwho.is/?fields=country_code', { signal: AbortSignal.timeout(4000) })
      .then(r => r.json())
      .then((data: { country_code?: string }) => {
        // Ignore if the user changed language while the request was in flight
        if (localStorage.getItem(STORAGE_KEY)) return;
        const cc = (data?.country_code ?? '').toUpperCase();
        const lang: Lang = COUNTRY_LANG_MAP[cc] ?? 'en';
        this.setLang(lang, false); // not persisted – user override takes priority
      })
      .catch(() => { /* silently fall back to the resolved initial language */ });
  }

  /** @param persist  false when called from IP detection so the user's future choice is not overridden */
  setLang(lang: Lang, persist = true): void {
    if (this._current() === lang) return;
    this._current.set(lang);
    this.translate.reloadLang(lang).subscribe({
      next: () => this.translate.use(lang).subscribe(),
      error: () => this.translate.use(lang).subscribe(),
    });
    if (isPlatformBrowser(this.platformId)) {
      if (persist) localStorage.setItem(STORAGE_KEY, lang);
      this.doc.documentElement.lang = lang;
    }
    this.applyLanguageAccent(lang);
  }

  private applyLanguageAccent(lang: Lang): void {
    const accent: LanguageAccent = lang === 'sq' ? 'albanian' : 'default';
    this.themeService.setLanguageAccent(accent);
  }

  /** Return the label + flag for the current language */
  get currentMeta() {
    return SUPPORTED_LANGS.find(l => l.code === this._current()) ?? SUPPORTED_LANGS[0];
  }
}
