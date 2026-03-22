import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, map } from 'rxjs/operators';
import { Observable, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginPayload, OtpRequestResponse, RegisterPayload, User } from '../models/user.model';

const TOKEN_KEY = 'portfolio_token';
const REFRESH_TOKEN_KEY = 'portfolio_refresh_token';
const USER_KEY = 'portfolio_user';
/** Automatically log out after 30 minutes of user inactivity */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // Signals for reactive state
  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _user = signal<User | null>(this.parseStoredUser());

  readonly isLoggedIn = computed(() => !!this._token());
  readonly currentUser = computed(() => this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  // Refresh token coordination — prevents multiple simultaneous refresh calls
  private _isRefreshing = false;
  readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _activityEvents = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
  private readonly _boundResetTimer = () => this.resetInactivityTimer();

  constructor(private http: HttpClient, private router: Router) {
    window.addEventListener('storage', this.handleStorageSync);
    if (this.isLoggedIn()) {
      this.startInactivityTimer();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this.handleStorageSync);
    this.stopInactivityTimer();
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, payload).pipe(
      tap(res => this.saveSession(res)),
    );
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, payload).pipe(
      tap(res => this.saveSession(res)),
    );
  }

  /** Request an OTP sent via SMS (phone) or email. Pass whichever the user entered. */
  requestOtp(identifier: string): Observable<OtpRequestResponse> {
    const isEmail = identifier.includes('@');
    const body = isEmail ? { email: identifier } : { phone: identifier };
    return this.http.post<OtpRequestResponse>(`${this.apiUrl}/otp/request`, body);
  }

  /** Verify OTP and save session on success. */
  verifyOtp(identifier: string, otp: string): Observable<AuthResponse> {
    const isEmail = identifier.includes('@');
    const body = isEmail ? { email: identifier, otp } : { phone: identifier, otp };
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/otp/verify`, body)
      .pipe(tap(res => this.saveSession(res)));
  }

  /**
   * Attempt to get a new access token using the stored refresh token.
   * Multiple callers share a single in-flight request via BehaviorSubject.
   */
  doRefresh(): Observable<string> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    if (this._isRefreshing) {
      // Queue: wait for the in-flight refresh to complete
      return this.refreshTokenSubject.pipe(
        filter((token): token is string => token !== null),
        take(1),
      );
    }

    this._isRefreshing = true;
    this.refreshTokenSubject.next(null);

    return this.http
      .post<AuthResponse>(`${this.apiUrl}/refresh`, { refreshToken })
      .pipe(
        tap(res => {
          this.saveSession(res);
          this._isRefreshing = false;
          this.refreshTokenSubject.next(res.access_token);
        }),
        map(res => res.access_token),
        catchError(err => {
          this._isRefreshing = false;
          this.clearSession();
          void this.router.navigateByUrl('/admin/login', { replaceUrl: true });
          return throwError(() => err);
        }),
      );
  }

  logout(redirectUrl = '/admin/login'): void {
    const token = this._token();
    if (token) {
      // Best-effort server-side revocation — don't block the UI on this
      this.http.post(`${this.apiUrl}/logout`, {}).subscribe({ error: () => {} });
    }
    this.clearSession();
    void this.router.navigateByUrl(redirectUrl, { replaceUrl: true });
  }

  getToken(): string | null {
    return this._token();
  }

  // ── Inactivity timer ─────────────────────────────────────────────────────────

  private startInactivityTimer(): void {
    this.stopInactivityTimer();
    this._activityEvents.forEach(event =>
      document.addEventListener(event, this._boundResetTimer, { passive: true }),
    );
    this.scheduleInactivityLogout();
  }

  private stopInactivityTimer(): void {
    this._activityEvents.forEach(event =>
      document.removeEventListener(event, this._boundResetTimer),
    );
    if (this._inactivityTimer !== null) {
      clearTimeout(this._inactivityTimer);
      this._inactivityTimer = null;
    }
  }

  private scheduleInactivityLogout(): void {
    if (this._inactivityTimer !== null) clearTimeout(this._inactivityTimer);
    this._inactivityTimer = setTimeout(() => {
      if (this.isLoggedIn()) {
        this.logout();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }

  resetInactivityTimer(): void {
    if (this.isLoggedIn()) {
      this.scheduleInactivityLogout();
    }
  }

  // ── Session persistence ───────────────────────────────────────────────────────

  private saveSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.access_token);
    if (res.refresh_token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
    }
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._token.set(res.access_token);
    this._user.set(res.user);
    this.startInactivityTimer();
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.stopInactivityTimer();
  }

  private parseStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private readonly handleStorageSync = (event: StorageEvent): void => {
    if (event.storageArea !== localStorage) return;
    if (event.key !== TOKEN_KEY && event.key !== USER_KEY) return;

    const wasLoggedIn = this.isLoggedIn();
    const token = localStorage.getItem(TOKEN_KEY);
    const user = this.parseStoredUser();

    this._token.set(token);
    this._user.set(user);

    if (token) {
      this.startInactivityTimer();
    } else {
      this.stopInactivityTimer();
    }

    if (wasLoggedIn && !token && this.router.url.startsWith('/admin')) {
      void this.router.navigateByUrl('/admin/login', { replaceUrl: true });
    }
  };
}
