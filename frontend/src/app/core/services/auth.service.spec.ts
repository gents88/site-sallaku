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
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  const apiUrl = `${environment.apiUrl}/auth`;
  const user: User = { _id: 'u1', name: 'Test', email: 'test@example.com', role: 'user' };
  const authResponse: AuthResponse = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user,
  };

  beforeEach(() => {
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };

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

  it('clears the session and redirects to login on logout', () => {
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.logout();
    httpMock.expectOne(`${apiUrl}/logout`).flush({});

    expect(service.isLoggedIn()).toBe(false);
    expect(service.getToken()).toBeNull();
    expect(localStorage.getItem('portfolio_token')).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/login', { replaceUrl: true });
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

  it('clears the session and redirects to login when refresh fails', () => {
    service.login({ email: 'test@example.com', password: 'pw' }).subscribe();
    httpMock.expectOne(`${apiUrl}/login`).flush(authResponse);

    service.doRefresh().subscribe({ error: () => {} });
    httpMock.expectOne(`${apiUrl}/refresh`).flush('invalid', { status: 401, statusText: 'Unauthorized' });

    expect(service.isLoggedIn()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/login', { replaceUrl: true });
  });
});
