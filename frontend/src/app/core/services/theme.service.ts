import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, signal, effect } from '@angular/core';

type Theme = 'light' | 'dark';
export type LanguageAccent = 'default' | 'albanian';

const THEME_STORAGE_KEY = 'portfolio_theme';
const ACCENT_STORAGE_KEY = 'portfolio_accent';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.getPreferred());
  readonly languageAccent = signal<LanguageAccent>(this.getPreferredAccent());

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    // Persist to localStorage whenever theme changes
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const t = this.theme();
      localStorage.setItem(THEME_STORAGE_KEY, t);
      this.document.documentElement.setAttribute('data-theme', t);
      this.updateThemeColor(t);
    });

    // Persist language accent and apply CSS attribute
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const accent = this.languageAccent();
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      this.document.documentElement.setAttribute('data-accent', accent);
    });
  }

  init(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.document.documentElement.setAttribute('data-theme', this.theme());
    this.document.documentElement.setAttribute('data-accent', this.languageAccent());
    this.updateThemeColor(this.theme());
  }

  toggle(): void {
    this.theme.update(t => (t === 'light' ? 'dark' : 'light'));
  }

  setLanguageAccent(accent: LanguageAccent): void {
    this.languageAccent.set(accent);
  }

  isDark(): boolean {
    return this.theme() === 'dark';
  }

  isAlbanianAccent(): boolean {
    return this.languageAccent() === 'albanian';
  }

  private getPreferred(): Theme {
    if (!isPlatformBrowser(this.platformId)) return 'dark';

    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private getPreferredAccent(): LanguageAccent {
    if (!isPlatformBrowser(this.platformId)) return 'default';

    const stored = localStorage.getItem(ACCENT_STORAGE_KEY) as LanguageAccent | null;
    if (stored && ['default', 'albanian'].includes(stored)) return stored;
    return 'default';
  }

  private updateThemeColor(theme: Theme): void {
    const meta = this.document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const color = theme === 'dark' ? '#0a0e1a' : '#f8faff';

    if (meta) {
      meta.setAttribute('content', color);
      return;
    }

    const created = this.document.createElement('meta');
    created.name = 'theme-color';
    created.content = color;
    this.document.head.appendChild(created);
  }
}
