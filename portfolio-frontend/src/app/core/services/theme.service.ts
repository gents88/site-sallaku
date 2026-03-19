import { Injectable, signal, effect } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'portfolio_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.getPreferred());

  constructor() {
    // Persist to localStorage whenever theme changes
    effect(() => {
      const t = this.theme();
      localStorage.setItem(STORAGE_KEY, t);
      document.documentElement.setAttribute('data-theme', t);
    });
  }

  init(): void {
    document.documentElement.setAttribute('data-theme', this.theme());
  }

  toggle(): void {
    this.theme.update(t => (t === 'light' ? 'dark' : 'light'));
  }

  isDark(): boolean {
    return this.theme() === 'dark';
  }

  private getPreferred(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
