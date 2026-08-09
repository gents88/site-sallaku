import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  function setup(authServiceStub: Partial<AuthService>) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceStub },
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  it('attaches the bearer token when one is available', () => {
    const { http, httpMock } = setup({ getToken: () => 'my-token' });

    http.get('/api/v1/whoami').subscribe();

    const req = httpMock.expectOne('/api/v1/whoami');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
    req.flush({});
    httpMock.verify();
  });

  it('does not attach an Authorization header when there is no token', () => {
    const { http, httpMock } = setup({ getToken: () => null });

    http.get('/api/v1/whoami').subscribe();

    const req = httpMock.expectOne('/api/v1/whoami');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    httpMock.verify();
  });

  it('refreshes the token and retries the request on a 401', () => {
    const doRefresh = vi.fn().mockReturnValue(of('new-token'));
    const { http, httpMock } = setup({ getToken: () => 'expired-token', doRefresh });

    let result: unknown;
    http.get('/api/v1/protected').subscribe((res) => (result = res));

    const firstReq = httpMock.expectOne('/api/v1/protected');
    firstReq.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(doRefresh).toHaveBeenCalled();

    const retriedReq = httpMock.expectOne('/api/v1/protected');
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer new-token');
    retriedReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
    httpMock.verify();
  });

  it('propagates the error and does not attempt a refresh for auth-bypass endpoints', () => {
    const doRefresh = vi.fn();
    const { http, httpMock } = setup({ getToken: () => 'expired-token', doRefresh });

    let error: unknown;
    http.post('/api/v1/auth/login', {}).subscribe({ error: (err) => (error = err) });

    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(doRefresh).not.toHaveBeenCalled();
    expect(error).toBeTruthy();
    httpMock.verify();
  });

  it('propagates the refresh error when the refresh attempt itself fails', () => {
    const doRefresh = vi.fn().mockReturnValue(throwError(() => new Error('refresh failed')));
    const { http, httpMock } = setup({ getToken: () => 'expired-token', doRefresh });

    let error: unknown;
    http.get('/api/v1/protected').subscribe({ error: (err) => (error = err) });

    httpMock.expectOne('/api/v1/protected').flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect((error as Error).message).toBe('refresh failed');
    httpMock.verify();
  });
});
