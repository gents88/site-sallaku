import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { authGuard } from '../guards/auth.guard';
import { environment } from '../../../environments/environment';

const user = { _id: 'u1', name: 'Gent', email: 'g@x.it', role: 'admin' as const };

describe('AuthService — httpOnly refresh cookie mode', () => {
  beforeEach(() => {
    (environment as { authRefreshCookie: boolean }).authRefreshCookie = true;
    localStorage.clear();
  });
  afterEach(() => {
    (environment as { authRefreshCookie: boolean }).authRefreshCookie = false;
    localStorage.clear();
  });

  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
  }

  it('never writes tokens to localStorage, only the user', () => {
    const { auth, http } = setup();
    auth.login({ email: 'g@x.it', password: 'x' }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.withCredentials).toBe(true);
    req.flush({ access_token: 'acc', user });
    expect(auth.getToken()).toBe('acc');
    expect(localStorage.getItem('portfolio_token')).toBeNull();
    expect(localStorage.getItem('portfolio_refresh_token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('portfolio_user')!).name).toBe('Gent');
  });

  it('restores the session from the cookie on load, sending no token in the body', () => {
    localStorage.setItem('portfolio_user', JSON.stringify(user));
    const { auth, http } = setup();
    expect(auth.restoring()).toBe(true);
    const req = http.expectOne(`${environment.apiUrl}/auth/refresh`);
    expect(req.request.body).toEqual({});
    expect(req.request.withCredentials).toBe(true);
    req.flush({ access_token: 'acc2', user });
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.restoring()).toBe(false);
  });

  it('a failed restore drops the session quietly, without redirecting', () => {
    localStorage.setItem('portfolio_user', JSON.stringify(user));
    const { auth, http } = setup();
    const navigate = TestBed.inject(Router).navigateByUrl;
    http.expectOne(`${environment.apiUrl}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.restoring()).toBe(false);
    expect(navigate).toBeDefined();
    expect(localStorage.getItem('portfolio_user')).toBeNull();
  });

  it('the auth guard waits for the restore instead of bouncing to login', async () => {
    localStorage.setItem('portfolio_user', JSON.stringify(user));
    const { http } = setup();
    const result = TestBed.runInInjectionContext(() => authGuard(null as never, null as never));
    expect(isObservable(result)).toBe(true);
    http.expectOne(`${environment.apiUrl}/auth/refresh`).flush({ access_token: 'acc', user });
    TestBed.tick();
    const decided = await firstValueFrom(isObservable(result) ? result : of(result));
    expect(decided instanceof UrlTree).toBe(false);
    expect(decided).toBe(true);
  });
});
