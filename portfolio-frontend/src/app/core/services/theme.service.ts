import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';
export type LanguageAccent = 'default' | 'albanian';

const THEME_STORAGE_KEY = 'portfolio_theme';
const ACCENT_STORAGE_KEY = 'portfolio_accent';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.getPreferred());
  readonly languageAccent = signal<LanguageAccent>(this.getPreferredAccent());

  constructor() {
    // Persist to localStorage whenever theme changes
    effect(() => {
      const t = this.theme();
      localStorage.setItem(THEME_STORAGE_KEY, t);
      document.documentElement.setAttribute('data-theme', t);
    });

    // Persist language accent and apply CSS attribute
    effect(() => {
      const accent = this.languageAccent();
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      document.documentElement.setAttribute('data-accent', accent);
    });
  }

  init(): void {
    document.documentElement.setAttribute('data-theme', this.theme());
    document.documentElement.setAttribute('data-accent', this.languageAccent());
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
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private getPreferredAccent(): LanguageAccent {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY) as LanguageAccent | null;
    if (stored && ['default', 'albanian'].includes(stored)) return stored;
    return 'default';
  }
}
