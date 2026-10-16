import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Absolute API base (e.g. `https://gentsallaku.it/api/v1`) used only while
 * prerendering. Provided exclusively in app.config.server.ts: in the browser
 * the token is absent and requests keep the relative `environment.apiUrl`.
 */
export const SERVER_API_BASE_URL = new InjectionToken<string>('SERVER_API_BASE_URL');

/** The API base the app's services build their URLs from (DI so tests can swap it). */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/**
 * In production `environment.apiUrl` is relative (`/api/v1`, proxied by Apache
 * to the backend on the same host). The prerender step runs in Node during
 * `ng build`, where a relative URL has no origin to resolve against, so every
 * API call would fail and the prerendered pages would ship without their
 * data. Here relative API URLs are made absolute — server side only.
 */
export const serverApiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(SERVER_API_BASE_URL, { optional: true });
  const relativeApi = inject(API_URL);
  if (!base || !relativeApi.startsWith('/') || !req.url.startsWith(relativeApi)) return next(req);
  return next(req.clone({ url: base + req.url.slice(relativeApi.length) }));
};
