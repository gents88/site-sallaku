import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { labToolIdForUrl } from '../navigation/lab-tools';

export const LAB_RECENT_KEY = 'gs.lab-recent-tools';
export const LAB_RECENT_MAX = 4;

export interface LabRecentTool {
  id: string;
  usedAt: number;
}

/**
 * Strumenti del Lab aperti di recente su questo dispositivo, per il
 * "Continua da dove eri rimasto" della pagina /lab. Solo id e orario: i file
 * restano in memoria nel WorkspaceService e non vengono mai salvati.
 */
@Injectable({ providedIn: 'root' })
export class LabActivityService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _recent = signal<LabRecentTool[]>(this.load());
  readonly recent = this._recent.asReadonly();

  constructor() {
    if (!this.isBrowser) return;
    const sub = inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const id = labToolIdForUrl(e.urlAfterRedirects);
        if (id) this.record(id);
      });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  init(): void {
    // Istanzia il servizio all'avvio, così registra anche il primo strumento aperto.
  }

  record(id: string): void {
    const next = [{ id, usedAt: Date.now() }, ...this._recent().filter(t => t.id !== id)].slice(0, LAB_RECENT_MAX);
    this._recent.set(next);
    try {
      localStorage.setItem(LAB_RECENT_KEY, JSON.stringify(next));
    } catch { /* storage bloccato: resta solo per questa sessione */ }
  }

  private load(): LabRecentTool[] {
    if (!this.isBrowser) return [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LAB_RECENT_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((t): t is LabRecentTool => !!t && typeof t.id === 'string' && typeof t.usedAt === 'number')
        .slice(0, LAB_RECENT_MAX);
    } catch {
      return [];
    }
  }
}
