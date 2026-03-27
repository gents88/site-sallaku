import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
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

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Skip auth errors — handled by authInterceptor
      if (err.status === 401) {
        return throwError(() => err);
      }

      const message = extractMessage(err);

      if (err.status === 0) {
        snackbar.show('No internet connection. Check your network and try again.', 'error');
      } else if (err.status === 400) {
        // Show validation error if present; otherwise generic message
        snackbar.show(message ?? 'Invalid request. Please check your input.', 'error');
      } else if (err.status === 403) {
        snackbar.show('Access denied. You do not have permission for this action.', 'error');
      } else if (err.status === 429) {
        snackbar.show('Too many requests. Please wait a moment and try again.', 'error');
      } else if (err.status >= 500) {
        snackbar.show('A server error occurred. Please try again later.', 'error');
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
