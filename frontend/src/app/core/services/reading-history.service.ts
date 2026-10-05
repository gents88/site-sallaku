import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export interface ReadEntry {
  /** Slug nella lingua in cui il post è stato letto. */
  slug: string;
  lang: string;
  title: string;
  excerpt?: string;
  readAt: number;
}

export const READING_HISTORY_KEY = 'gs.reading-history';
export const READING_HISTORY_MAX = 12;

/**
 * Ultimi articoli aperti su questo dispositivo. Il service worker tiene in
 * cache le loro risposte API, quindi sono proprio quelli leggibili offline:
 * la pagina blog li propone quando la lista non si carica.
 */
@Injectable({ providedIn: 'root' })
export class ReadingHistoryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _entries = signal<ReadEntry[]>(this.load());
  readonly entries = this._entries.asReadonly();

  record(entry: Omit<ReadEntry, 'readAt'>): void {
    if (!this.isBrowser || !entry.slug) return;
    const next = [
      { ...entry, readAt: Date.now() },
      ...this._entries().filter(e => !(e.slug === entry.slug && e.lang === entry.lang)),
    ].slice(0, READING_HISTORY_MAX);
    this._entries.set(next);
    try {
      localStorage.setItem(READING_HISTORY_KEY, JSON.stringify(next));
    } catch { /* storage pieno o bloccato: la cronologia resta solo in memoria */ }
  }

  /** Voci lette in `lang`, le più recenti prima. */
  forLang(lang: string): ReadEntry[] {
    return this._entries().filter(e => e.lang === lang);
  }

  private load(): ReadEntry[] {
    if (!this.isBrowser) return [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(READING_HISTORY_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((e): e is ReadEntry => !!e && typeof e.slug === 'string' && typeof e.title === 'string' && typeof e.lang === 'string')
        .slice(0, READING_HISTORY_MAX);
    } catch {
      return [];
    }
  }
}
