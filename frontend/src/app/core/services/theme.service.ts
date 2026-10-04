import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, computed, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';
/** 'system' segue prefers-color-scheme anche quando cambia a pagina aperta (es. modalità notte automatica). */
export type ThemePreference = Theme | 'system';
const PREFERENCE_CYCLE: ThemePreference[] = ['light', 'dark', 'system'];
export type LanguageAccent = 'default' | 'albanian';

/**
 * Solo una scelta esplicita dell'utente (chiaro/scuro) viene salvata; senza,
 * il tema segue il sistema di telefono/PC. Chiave nuova perché la vecchia
 * (`portfolio_theme`) veniva scritta a ogni visita col tema corrente anche
 * senza alcuna scelta: chiunque fosse già passato dal sito restava bloccato
 * su quel tema e non seguiva più il sistema. Tenere allineato con lo script
 * inline in src/index.html, che applica il tema prima del primo paint.
 */
export const THEME_CHOICE_KEY = 'portfolio_theme_choice';
const LEGACY_THEME_KEY = 'portfolio_theme';
const ACCENT_STORAGE_KEY = 'portfolio_accent';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.getStoredPreference());
  private readonly systemDark = signal(this.readSystemDark());
  /** Tema effettivo applicato a <html data-theme>. */
  readonly theme = computed<Theme>(() => {
    const pref = this.preference();
    return pref === 'system' ? (this.systemDark() ? 'dark' : 'light') : pref;
  });
  readonly languageAccent = signal<LanguageAccent>(this.getPreferredAccent());

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const t = this.theme();
      this.document.documentElement.setAttribute('data-theme', t);
      this.updateThemeColor(t);
    });

    if (isPlatformBrowser(this.platformId) && typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener?.('change', e => this.systemDark.set(e.matches));
    }

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

  /** Inverte il tema effettivo, fissandolo come preferenza esplicita (palette Ctrl+K). */
  toggle(): void {
    this.setPreference(this.theme() === 'light' ? 'dark' : 'light');
  }

  /** Pulsante in navbar: chiaro → scuro → sistema → chiaro. */
  cycle(): void {
    const i = PREFERENCE_CYCLE.indexOf(this.preference());
    this.setPreference(PREFERENCE_CYCLE[(i + 1) % PREFERENCE_CYCLE.length]);
  }

  /** Scelta esplicita: chiaro/scuro vengono ricordati, 'system' torna a seguire il dispositivo. */
  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (pref === 'system') localStorage.removeItem(THEME_CHOICE_KEY);
      else localStorage.setItem(THEME_CHOICE_KEY, pref);
    } catch { /* storage non disponibile */ }
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

  private getStoredPreference(): ThemePreference {
    if (!isPlatformBrowser(this.platformId)) return 'dark';
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_CHOICE_KEY);
      // Il valore della vecchia chiave non era una scelta dell'utente: si scarta.
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch { /* storage non disponibile */ }
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }

  private readSystemDark(): boolean {
    if (!isPlatformBrowser(this.platformId) || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
