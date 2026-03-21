import { Injectable, signal, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ThemeService, type LanguageAccent } from './theme.service';

export type Lang = 'it' | 'en' | 'sq';

export const SUPPORTED_LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'sq', label: 'Shqip',    flag: '🇦🇱' },
];

const STORAGE_KEY = 'gs-portfolio-lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _current = signal<Lang>(this.resolveInitialLang());
  private readonly themeService = inject(ThemeService);

  readonly current = this._current.asReadonly();
  readonly supported = SUPPORTED_LANGS;

  constructor(private translate: TranslateService) {
    this.translate.addLangs(['it', 'en', 'sq']);
    this.translate.setFallbackLang('it').subscribe();
    this.translate.use(this._current()).subscribe();
    document.documentElement.lang = this._current();
    this.applyLanguageAccent(this._current());
  }

  setLang(lang: Lang): void {
    if (this._current() === lang) return;
    this._current.set(lang);
    this.translate.reloadLang(lang).subscribe({
      next: () => this.translate.use(lang).subscribe(),
      error: () => this.translate.use(lang).subscribe(),
    });
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
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

  private resolveInitialLang(): Lang {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored && ['it', 'en', 'sq'].includes(stored)) return stored;

    const browser = navigator.language.slice(0, 2) as Lang;
    if (['it', 'en', 'sq'].includes(browser)) return browser;

    return 'it';
  }
}
