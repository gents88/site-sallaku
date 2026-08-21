import { HttpContextToken, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
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
 * Set on a request's HttpContext to opt it out of this interceptor's
 * caching. Used by services that already manage their own cache with
 * explicit post-mutation invalidation (e.g. ApiCacheService, used by
 * BlogService/ProjectsService) — without this, those endpoints were being
 * double-cached here too, with a fixed 2-minute TTL and no way to bust it,
 * so an admin edit could still look stale to public visitors for up to
 * 2 minutes after the service-level cache was already correctly invalidated.
 */
export const SKIP_CACHE_INTERCEPTOR = new HttpContextToken<boolean>(() => false);

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

  // Endpoints already covered by a service-level cache with explicit
  // invalidation (see SKIP_CACHE_INTERCEPTOR doc above) opt out here.
  if (req.context.get(SKIP_CACHE_INTERCEPTOR)) return next(req);

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
