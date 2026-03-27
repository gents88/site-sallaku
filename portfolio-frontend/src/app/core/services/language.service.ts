import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { ThemeService, type LanguageAccent } from './theme.service';

export type Lang = 'it' | 'en' | 'sq';

export const SUPPORTED_LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'sq', label: 'Shqip',    flag: '🇦🇱' },
];

const STORAGE_KEY = 'gs-portfolio-lang';

export function resolveInitialLanguage(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && ['it', 'en', 'sq'].includes(stored)) {
      return stored;
    }
  }

  if (typeof navigator !== 'undefined') {
    const browser = navigator.language.slice(0, 2) as Lang;
    if (['it', 'en', 'sq'].includes(browser)) {
      return browser;
    }
  }

  return 'it';
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
    this.translate.addLangs(['it', 'en', 'sq']);
    if (isPlatformBrowser(this.platformId)) {
      this.doc.documentElement.lang = this._current();
    }
    this.applyLanguageAccent(this._current());
  }

  setLang(lang: Lang): void {
    if (this._current() === lang) return;
    this._current.set(lang);
    this.translate.reloadLang(lang).subscribe({
      next: () => this.translate.use(lang).subscribe(),
      error: () => this.translate.use(lang).subscribe(),
    });
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, lang);
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
