import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry {
  response: HttpResponse<unknown>;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 120_000; // 2 minutes
const MAX_CACHE_ENTRIES = 100;

/**
 * In-memory cache for GET requests.
 * Serves the cached response immediately if still fresh,
 * avoiding redundant network calls on repeated navigation.
 *
 * Authenticated requests are intentionally bypassed to prevent serving
 * stale admin data after token rotation or logout.
 */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);

  // Never cache authenticated calls — avoids stale admin data post-logout
  if (req.headers.has('Authorization')) return next(req);

  const cached = cache.get(req.urlWithParams);
  if (cached && Date.now() < cached.expiry) {
    return of(cached.response.clone());
  }

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse && event.status === 200) {
        // LRU eviction: remove oldest entry when the cap is reached
        if (cache.size >= MAX_CACHE_ENTRIES) {
          cache.delete(cache.keys().next().value as string);
        }
        cache.set(req.urlWithParams, {
          response: event.clone(),
          expiry: Date.now() + CACHE_TTL_MS,
        });
      }
    }),
  );
};
