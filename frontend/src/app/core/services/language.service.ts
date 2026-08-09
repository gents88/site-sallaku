import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { ThemeService, type LanguageAccent } from './theme.service';

export type Lang = 'it' | 'en' | 'sq' | 'es' | 'pt' | 'fr' | 'de';

/** Every language except the unprefixed default ('it'). Drives the URL prefix scheme. */
export const NON_DEFAULT_LANGS: Lang[] = ['en', 'sq', 'es', 'pt', 'fr', 'de'];

/** Language-neutral basePath (e.g. '/blog/foo') + target lang → prefixed path. 'it' never gets a prefix. */
export function withLangPrefix(basePath: string, lang: Lang): string {
  const clean = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return lang === 'it' ? clean : `/${lang}${clean === '/' ? '' : clean}`;
}

/** Possibly-prefixed path → { lang, basePath } (basePath always starts with '/', never lang-prefixed). */
export function stripLangPrefix(path: string): { lang: Lang; basePath: string } {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && (NON_DEFAULT_LANGS as string[]).includes(segments[0])) {
    const lang = segments[0] as Lang;
    const rest = '/' + segments.slice(1).join('/');
    return { lang, basePath: rest === '/' ? '/' : rest };
  }
  return { lang: 'it', basePath: path.startsWith('/') ? path : `/${path}` };
}

export const SUPPORTED_LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano',   flag: '🇮🇹' },
  { code: 'en', label: 'English',    flag: '🇬🇧' },
  { code: 'sq', label: 'Shqip',      flag: '🇦🇱' },
  { code: 'es', label: 'Español',    flag: '🇪🇸' },
  { code: 'pt', label: 'Português',  flag: '🇵🇹' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪' },
];

export const STORAGE_KEY = 'gs-portfolio-lang';

/** Country codes (ISO 3166-1 alpha-2) mapped to supported languages */
export const COUNTRY_LANG_MAP: Record<string, Lang> = {
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

export const ALL_LANGS: Lang[] = ['it', 'en', 'sq', 'es', 'pt', 'fr', 'de'];

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
  private readonly router = inject(Router);

  /** Set true once a route was reached via an explicit /en/, /es/... prefix — blocks IP-geo from overriding it. */
  private urlLangExplicit = false;

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
    // Respect an explicit /en/, /es/... URL — never override deliberate navigation
    if (this.urlLangExplicit) return;

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

  /**
   * Explicit user override (e.g. a "force Albanian" action outside the
   * lang-prefixed router flow): always persists, so it also blocks any
   * future IP-geo detection on this device. Named to match the
   * force/reset pair callers expect; behaviourally identical to
   * `setLang(lang, true)`.
   */
  forceLanguage(lang: Lang): void {
    this.setLang(lang, true);
  }

  /**
   * Clears the stored preference and re-derives the language from
   * navigator locale, then re-runs IP-geo detection as if this were a
   * first visit. Useful for a "use my detected language" settings action.
   */
  resetLanguagePreference(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.setLang(resolveInitialLanguage(), false);
    this.detectLanguageFromIP();
  }

  /**
   * Dev/QA helper: applies the language for a given ISO country code
   * without waiting on (or needing) the real IP lookup. Mirrors the
   * `COUNTRY_LANG_MAP` resolution used by `detectLanguageFromIP`. Does not
   * persist, matching that method's semantics.
   */
  simulateCountry(countryCode: string): void {
    const lang: Lang = COUNTRY_LANG_MAP[countryCode.toUpperCase()] ?? 'en';
    this.setLang(lang, false);
  }

  /**
   * Called by the route resolver (lang.resolver.ts) on every navigation —
   * this, not resolveInitialLanguage(), is the authoritative source of
   * "what language is this page in" once path-prefix routing is active.
   * Unlike setLang(), never persists to localStorage on its own: an
   * unprefixed /blog/... visit must stay Italian for crawlers even if a
   * returning visitor's stored preference differs (see
   * maybeRedirectToStoredPreference, which handles that case by navigating
   * instead of silently reskinning the page).
   *
   * @param explicit  true when the URL actually carried a /en/, /es/...
   *   segment (as opposed to `lang` being the unprefixed 'it' default) —
   *   used to stop the first-visit IP-geo detection from overriding a
   *   deliberate language-prefixed link/bookmark.
   */
  setLangFromUrl(lang: Lang, explicit: boolean): Observable<Lang> {
    this.urlLangExplicit = explicit;
    if (this._current() !== lang) {
      this._current.set(lang);
      this.applyLanguageAccent(lang);
    }
    if (isPlatformBrowser(this.platformId)) {
      this.doc.documentElement.lang = lang;
      if (explicit) {
        // Whatever prefixed URL the visitor is actually on (whether they
        // clicked the switcher, a bookmark, or a search result) becomes
        // their remembered preference — mirrors setLang()'s persist=true
        // default. Never persisted for the unprefixed/default case: that
        // would overwrite a stored preference right before
        // maybeRedirectToStoredPreference below gets a chance to read it.
        localStorage.setItem(STORAGE_KEY, lang);
      } else {
        this.maybeRedirectToStoredPreference(lang);
      }
    }
    return new Observable<Lang>(subscriber => {
      this.translate.use(lang).subscribe({
        next: () => { subscriber.next(lang); subscriber.complete(); },
        error: () => { subscriber.next(lang); subscriber.complete(); }, // never block navigation on a translation load failure
      });
    });
  }

  /**
   * Returning visitor with a saved non-Italian preference who landed on an
   * unprefixed (Italian-default) URL gets bounced client-side to their
   * preferred /xx/... prefix. Deferred to a macrotask so it runs after the
   * current navigation/resolve cycle finishes, not during it. Crawlers
   * never see this (no localStorage), so the static/prerendered HTML for
   * the unprefixed URL stays consistently Italian.
   */
  private maybeRedirectToStoredPreference(urlLang: Lang): void {
    if (urlLang !== 'it') return;
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (!stored || stored === 'it' || !ALL_LANGS.includes(stored)) return;
    setTimeout(() => {
      const { basePath } = stripLangPrefix(this.router.url.split('?')[0]);
      this.router.navigateByUrl(withLangPrefix(basePath, stored), { replaceUrl: true });
    }, 0);
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
