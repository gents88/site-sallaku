import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

/** jsdom non implementa matchMedia: lo si simula con listener pilotabili. */
function mockMatchMedia(dark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  window.matchMedia = vi.fn(() => ({
    matches: dark,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return (matches: boolean) => listeners.forEach(cb => cb({ matches }));
}

describe('ThemeService', () => {
  const original = window.matchMedia;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    window.matchMedia = original;
    localStorage.clear();
  });

  it('defaults to "system" and follows the OS, including changes while the page is open', () => {
    const emit = mockMatchMedia(true);
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    expect(theme.theme()).toBe('dark');
    emit(false);
    expect(theme.theme()).toBe('light');
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cycles light → dark → system, saving only explicit choices', () => {
    mockMatchMedia(false);
    localStorage.setItem('portfolio_theme_choice', 'light');
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('light');
    theme.cycle();
    expect(localStorage.getItem('portfolio_theme_choice')).toBe('dark');
    theme.cycle();
    expect(theme.preference()).toBe('system');
    // "Sistema" non è una scelta da ricordare: si torna a seguire il dispositivo.
    expect(localStorage.getItem('portfolio_theme_choice')).toBeNull();
    theme.cycle();
    expect(theme.preference()).toBe('light');
  });

  it('never writes anything while just following the system', () => {
    mockMatchMedia(true);
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(theme.theme()).toBe('dark');
    expect(localStorage.getItem('portfolio_theme_choice')).toBeNull();
  });

  it('ignores (and cleans up) the old auto-saved key, so returning visitors follow the system again', () => {
    mockMatchMedia(false);
    localStorage.setItem('portfolio_theme', 'dark');
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    expect(theme.theme()).toBe('light');
    expect(localStorage.getItem('portfolio_theme')).toBeNull();
  });

  it('ignores garbage in the choice key', () => {
    mockMatchMedia(true);
    localStorage.setItem('portfolio_theme_choice', 'purple');
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });

  it('toggle() pins the opposite of the effective theme (used by the Ctrl+K palette)', () => {
    mockMatchMedia(true);
    const theme = TestBed.inject(ThemeService);
    theme.toggle();
    expect(theme.preference()).toBe('light');
  });

  it('works without matchMedia (old browsers / jsdom)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(() => TestBed.inject(ThemeService)).not.toThrow();
  });
});
