import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry {
  response: HttpResponse<unknown>;
  expiry: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 120_000; // 2 minutes

/**
 * In-memory cache for GET requests.
 * Serves the cached response immediately if still fresh,
 * avoiding redundant network calls on repeated navigation.
 */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);

  const cached = cache.get(req.urlWithParams);
  if (cached && Date.now() < cached.expiry) {
    return of(cached.response.clone());
  }

  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse && event.status === 200) {
        cache.set(req.urlWithParams, {
          response: event.clone(),
          expiry: Date.now() + CACHE_TTL_MS,
        });
      }
    }),
  );
};
