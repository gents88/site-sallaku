import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Preloads only routes marked with `data: { preload: true }`.
 * Skips preloading entirely on slow connections (2g, slow-2g) or when
 * the user has enabled Data Saver. Otherwise delays preload by 3s so
 * the initial bundle finishes first.
 */
@Injectable({ providedIn: 'root' })
export class SelectivePreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const conn = (navigator as any).connection;
    const isSlow =
      conn?.saveData === true ||
      conn?.effectiveType === '2g' ||
      conn?.effectiveType === 'slow-2g';

    if (isSlow || route.data?.['preload'] !== true) {
      return of(null);
    }

    // Wait 3 s so the initial bundle and LCP resource don't compete for bandwidth
    return timer(3000).pipe(switchMap(() => load()));
  }
}
