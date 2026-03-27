import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** URLs that should never trigger a refresh attempt to avoid infinite loops */
const AUTH_BYPASS_URLS = ['/auth/refresh', '/auth/login', '/auth/otp/verify'];

function addBearerToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  const authorizedReq = token ? addBearerToken(req, token) : req;
  const isAuthEndpoint = AUTH_BYPASS_URLS.some(url => req.url.includes(url));

  return next(authorizedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // On 401, attempt a token refresh then retry — unless this IS the auth endpoint
      if (err.status === 401 && !isAuthEndpoint) {
        return auth.doRefresh().pipe(
          switchMap((newToken: string) => next(addBearerToken(req, newToken))),
          catchError((refreshErr) => {
            // Refresh failed — user must log in again (doRefresh handles logout)
            return throwError(() => refreshErr);
          }),
        );
      }
      return throwError(() => err);
    }),
  );
};
