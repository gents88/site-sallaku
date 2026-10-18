import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** Data Saver attivo o rete 2G: niente download facoltativi (preload del router, prefetch delle voci). */
export function isSlowConnection(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const conn = (nav as (Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }) | undefined)?.connection;
  return conn?.saveData === true || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g';
}

/**
 * Preloads only routes marked with `data: { preload: true }`.
 * Skips preloading entirely on slow connections (2g, slow-2g) or when
 * the user has enabled Data Saver. Otherwise delays preload by 3s so
 * the initial bundle finishes first.
 */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadStrategy implements PreloadingStrategy {
  private readonly platformId = inject(PLATFORM_ID);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!isPlatformBrowser(this.platformId)) return of(null);

    if (isSlowConnection() || route.data?.['preload'] !== true) {
      return of(null);
    }

    // Wait 3 s so the initial bundle and LCP resource don't compete for bandwidth
    return timer(3000).pipe(switchMap(() => load()));
  }
}
