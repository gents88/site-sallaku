import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';
import { AuthResponse, User } from '../models/user.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: { navigateByUrl: ReturnType<typeof vi.fn>; url: string };

  const apiUrl = `${environment.apiUrl}/auth`;
  const user: User = { _id: 'u1', name: 'Test', email: 'test@example.com', role: 'user' };
  const authResponse: AuthResponse = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user,
  };

  beforeEach(() => {
    router = { navigateByUrl: vi.fn().mockResolvedValue(true), url: '/' };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    localStorage.clear();
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.ngOnDestroy();
    httpMock.verify();
    localStorage.clear();
  });

  it('starts logged out with no stored session', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.currentUser()).toBeNull();
    expect(service.getToken()).toBeNull();
  });

  it('persists the session to localStorage and updates signals on login', () => {
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();

    const req = httpMock.expectOne(`${apiUrl}/login`);
    expect(req.request.method).toBe('POST');
    req.flush(authResponse);

    expect(service.isLoggedIn()).toBe(true);
    expect(service.getToken()).toBe('access-token');
    expect(service.currentUser()).toEqual(user);
    expect(localStorage.getItem('portfolio_token')).toBe('access-token');
    expect(localStorage.getItem('portfolio_refresh_token')).toBe('refresh-token');
  });

  it('does not start a session on register — the account still needs email verification', () => {
    service.register({ name: 'Test', email: 'test@example.com', password: 'Pass123!' }).subscribe();

    const req = httpMock.expectOne(`${apiUrl}/register`);
    expect(req.request.method).toBe('POST');
    req.flush({ message: 'Check your email', email: 'test@example.com' });

    expect(service.isLoggedIn()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(localStorage.getItem('portfolio_token')).toBeNull();
  });

  it('computes isAdmin from the stored user role', () => {
    service.login({ email: 'admin@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush({ ...authResponse, user: { ...user, role: 'admin' } });

    expect(service.isAdmin()).toBe(true);
  });

  it('sends the identifier as email when it looks like an email address', () => {
    service.requestOtp('test@example.com').subscribe();

    const req = httpMock.expectOne(`${apiUrl}/otp/request`);
    expect(req.request.body).toEqual({ email: 'test@example.com' });
    req.flush({ message: 'sent' });
  });

  it('sends the identifier as phone when it does not contain an "@"', () => {
    service.requestOtp('+15551234567').subscribe();

    const req = httpMock.expectOne(`${apiUrl}/otp/request`);
    expect(req.request.body).toEqual({ phone: '+15551234567' });
    req.flush({ message: 'sent' });
  });

  it('clears the session and redirects to login on logout from within /dashboard', () => {
    router.url = '/dashboard/projects';
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.logout();
    httpMock.expectOne(`${apiUrl}/logout`).flush({});

    expect(service.isLoggedIn()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(localStorage.getItem('portfolio_token')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/login', { replaceUrl: true });
  });

  it('clears the session without redirecting when logout happens outside /dashboard', () => {
    router.url = '/lab/pdf-translate';
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.logout();
    httpMock.expectOne(`${apiUrl}/logout`).flush({});

    expect(service.isLoggedIn()).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('always redirects to an explicit target regardless of current route', () => {
    router.url = '/lab/pdf-translate';
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.logout('/');
    httpMock.expectOne(`${apiUrl}/logout`).flush({});

    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
  });

  it('rejects doRefresh immediately when there is no stored refresh token', async () => {
    await expect(firstValueFrom(service.doRefresh())).rejects.toBeTruthy();
    httpMock.verify();
  });

  it('shares a single in-flight refresh call between concurrent callers', () => {
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    const results: string[] = [];
    service.doRefresh().subscribe((token) => results.push(token));
    service.doRefresh().subscribe((token) => results.push(token));

    // Only one HTTP call should be made for both subscribers
    const req = httpMock.expectOne(`${apiUrl}/refresh`);
    req.flush({ ...authResponse, access_token: 'new-access-token' });

    expect(results).toEqual(['new-access-token', 'new-access-token']);
  });

  describe('getFreshToken', () => {
    const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const jwtExpiringIn = (ms: number) =>
      `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub: 'u1', exp: Math.floor((Date.now() + ms) / 1000) }))}.sig`;

    function loginWith(accessToken: string): void {
      service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
      httpMock.expectOne(`${apiUrl}/login`).flush({ ...authResponse, access_token: accessToken });
    }

    it('senza sessione restituisce null e non fa richieste', async () => {
      await expect(firstValueFrom(service.getFreshToken())).resolves.toBeNull();
      httpMock.verify();
    });

    it('con un token ancora valido lo restituisce senza rinnovarlo', async () => {
      const token = jwtExpiringIn(10 * 60_000);
      loginWith(token);

      await expect(firstValueFrom(service.getFreshToken())).resolves.toBe(token);
      httpMock.verify();
    });

    it('con un token in scadenza (entro la soglia) lo rinnova e restituisce quello nuovo', () => {
      loginWith(jwtExpiringIn(30_000));

      let result: string | null | undefined;
      service.getFreshToken().subscribe((t) => (result = t));
      httpMock.expectOne(`${apiUrl}/refresh`).flush({ ...authResponse, access_token: 'rinnovato' });

      expect(result).toBe('rinnovato');
      expect(service.getToken()).toBe('rinnovato');
    });

    it('con un token già scaduto lo rinnova', () => {
      loginWith(jwtExpiringIn(-5_000));

      let result: string | null | undefined;
      service.getFreshToken().subscribe((t) => (result = t));
      httpMock.expectOne(`${apiUrl}/refresh`).flush({ ...authResponse, access_token: 'rinnovato' });

      expect(result).toBe('rinnovato');
    });

    it('rispetta la soglia indicata dal chiamante', () => {
      loginWith(jwtExpiringIn(5 * 60_000));

      let result: string | null | undefined;
      service.getFreshToken(10 * 60_000).subscribe((t) => (result = t));
      httpMock.expectOne(`${apiUrl}/refresh`).flush({ ...authResponse, access_token: 'rinnovato' });

      expect(result).toBe('rinnovato');
    });

    it('se il rinnovo fallisce restituisce null e la sessione viene chiusa', () => {
      loginWith(jwtExpiringIn(-5_000));

      let result: string | null | undefined;
      service.getFreshToken().subscribe((t) => (result = t));
      httpMock.expectOne(`${apiUrl}/refresh`).flush('no', { status: 401, statusText: 'Unauthorized' });

      expect(result).toBeNull();
      expect(service.isLoggedIn()).toBe(false);
    });

    it('un token senza scadenza leggibile viene restituito com\'è: il server decide', async () => {
      loginWith('access-token');

      await expect(firstValueFrom(service.getFreshToken())).resolves.toBe('access-token');
      httpMock.verify();
    });

    it('il rinnovo da socket non porta alla pagina di login', () => {
      loginWith(jwtExpiringIn(-5_000));

      service.getFreshToken().subscribe();
      httpMock.expectOne(`${apiUrl}/refresh`).flush('no', { status: 401, statusText: 'Unauthorized' });

      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  it('clears the session and redirects to login when refresh fails', () => {
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.doRefresh().subscribe({ error: () => {} });
    httpMock.expectOne(`${apiUrl}/refresh`).flush('invalid', { status: 401, statusText: 'Unauthorized' });

    expect(service.isLoggedIn()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/login', { replaceUrl: true });
  });
});
