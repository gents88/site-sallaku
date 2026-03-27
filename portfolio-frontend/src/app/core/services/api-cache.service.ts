import { Injectable } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';

interface CacheEntry<T> {
  obs: Observable<T>;
  expiresAt: number;
}

/**
 * Simple in-memory TTL cache for HTTP observables.
 * Wraps a factory observable with shareReplay(1) so concurrent subscribers
 * share one request and subsequent subscribers within the TTL window
 * receive the cached value instantly.
 */
@Injectable({ providedIn: 'root' })
export class ApiCacheService {
  private cache = new Map<string, CacheEntry<unknown>>();

  /** Return cached observable or execute factory, caching for `ttlMs` (default 60 s). */
  get<T>(key: string, factory: () => Observable<T>, ttlMs = 60_000): Observable<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() < entry.expiresAt) {
      return entry.obs;
    }

    const obs = factory().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.cache.set(key, { obs: obs as Observable<unknown>, expiresAt: Date.now() + ttlMs });
    return obs;
  }

  /** Explicitly invalidate a cache key (call after mutations). */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /** Invalidate all keys that start with a given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}
