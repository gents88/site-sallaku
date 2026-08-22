import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { SnackbarService } from '../services/snackbar.service';

/**
 * Global HTTP error interceptor.
 *
 * - 0 / network error  → "No internet connection" toast
 * - 400 Bad Request     → surfaces the server validation message
 * - 403 Forbidden       → "Access denied" toast
 * - 404 Not Found       → suppressed (component-level handling expected)
 * - 429 Too Many Requests → "Too many requests" toast
 * - 500+                → "Server error" toast
 *
 * 401 errors are handled upstream by the authInterceptor (token refresh flow).
 * This interceptor runs *after* authInterceptor in the chain.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackbar = inject(SnackbarService);
  const translate = inject(TranslateService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Skip auth errors — handled by authInterceptor
      if (err.status === 401) {
        return throwError(() => err);
      }

      const message = extractMessage(err);

      if (err.status === 0) {
        snackbar.show(translate.instant('common.http_errors.network'), 'error');
      } else if (err.status === 400) {
        // Show validation error if present; otherwise generic message
        snackbar.show(message ?? translate.instant('common.http_errors.invalid_request'), 'error');
      } else if (err.status === 403) {
        snackbar.show(translate.instant('common.http_errors.forbidden'), 'error');
      } else if (err.status === 429) {
        snackbar.show(translate.instant('common.http_errors.too_many_requests'), 'error');
      } else if (err.status >= 500) {
        snackbar.show(translate.instant('common.http_errors.server_error'), 'error');
      }
      // 404s are silently passed through — components handle their own "not found" state

      return throwError(() => err);
    }),
  );
};

function extractMessage(err: HttpErrorResponse): string | null {
  try {
    const body = err.error;
    if (typeof body === 'string') return body;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message[0] : String(body.message);
    }
  } catch {
    // ignore
  }
  return null;
}
