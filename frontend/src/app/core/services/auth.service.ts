import { Injectable, signal, computed, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, map } from 'rxjs/operators';
import { Observable, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginPayload, OtpRequestResponse, RegisterPayload, RegisterResponse, User } from '../models/user.model';
import { LAST_ACTIVITY_KEY } from './inactivity.service';

const TOKEN_KEY = 'portfolio_token';
const REFRESH_TOKEN_KEY = 'portfolio_refresh_token';
const USER_KEY = 'portfolio_user';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  private readonly isBrowser: boolean;

  // Signals for reactive state
  private _token = signal<string | null>(null);
  private _user = signal<User | null>(null);

  readonly isLoggedIn = computed(() => !!this._token());
  /**
   * Modalità cookie: al caricamento l'access token non è in storage e va
   * ripreso col refresh (cookie httpOnly). Finché è true l'authGuard attende
   * invece di rimandare al login una sessione ancora valida.
   */
  readonly restoring = signal(false);
  private readonly cookieMode = environment.authRefreshCookie === true;
  /** In modalità cookie le chiamate di auth devono portare/ricevere il cookie (API su sottodominio). */
  private get httpOpts() {
    return this.cookieMode ? { withCredentials: true } : {};
  }
  readonly currentUser = computed(() => this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  // Refresh token coordination — prevents multiple simultaneous refresh calls
  private _isRefreshing = false;
  readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this._user.set(this.parseStoredUser());
      window.addEventListener('storage', this.handleStorageSync);
      if (this.cookieMode) {
        // L'access token vive solo in memoria: se c'era una sessione, la si riprende dal cookie.
        if (this._user()) this.restoreFromCookie();
      } else {
        this._token.set(this.storage.getItem(TOKEN_KEY));
      }
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      window.removeEventListener('storage', this.handleStorageSync);
    }
  }

  /** Safe localStorage accessor — returns a no-op stub on the server. */
  private get storage(): Storage {
    return this.isBrowser ? localStorage : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage);
  }

  login(payload: LoginPayload): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, payload, this.httpOpts).pipe(
      tap(res => this.saveSession(res)),
    );
  }

  /**
   * Creates the account but does not log it in: the backend requires the
   * registrant to prove they own the email address first (an OTP is sent
   * as a side effect), so no session is saved here — the caller sends the
   * user to the OTP-verify step, which is what actually logs them in.
   */
  register(payload: RegisterPayload): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.apiUrl}/register`, payload);
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
      .post<AuthResponse>(`${this.apiUrl}/otp/verify`, body, this.httpOpts)
      .pipe(tap(res => this.saveSession(res)));
  }

  /**
   * Attempt to get a new access token using the stored refresh token.
   * Multiple callers share a single in-flight request via BehaviorSubject.
   */
  doRefresh(navigateOnFailure = true): Observable<string> {
    const refreshToken = this.storage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken && !this.cookieMode) {
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
      // Modalità cookie: niente token nel body, lo porta il cookie httpOnly.
      .post<AuthResponse>(`${this.apiUrl}/refresh`, this.cookieMode ? {} : { refreshToken }, this.httpOpts)
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
          if (navigateOnFailure) void this.router.navigateByUrl('/dashboard/login', { replaceUrl: true });
          return throwError(() => err);
        }),
      );
  }

  logout(redirectUrl?: string): void {
    const token = this._token();
    if (token) {
      // Best-effort server-side revocation — don't block the UI on this
      this.http.post(`${this.apiUrl}/logout`, {}, this.httpOpts).subscribe({ error: () => {} });
    }
    this.clearSession();

    // Explicit target always wins. Otherwise, only bounce to the admin login
    // when we were actually in /dashboard — a plain 'user' account logged out
    // (e.g. by the inactivity timer) while browsing /lab should just lose its
    // session in place, not get yanked to the admin login screen.
    if (redirectUrl) {
      void this.router.navigateByUrl(redirectUrl, { replaceUrl: true });
    } else if (this.router.url.startsWith('/dashboard')) {
      void this.router.navigateByUrl('/dashboard/login', { replaceUrl: true });
    }
  }

  getToken(): string | null {
    return this._token();
  }

  // L'inattività è gestita da InactivityService (un solo timer, per ruolo, con avviso).

  // ── Session persistence ───────────────────────────────────────────────────────

  private saveSession(res: AuthResponse): void {
    // In modalità cookie nessun token tocca lo storage (né access né refresh):
    // un XSS non può esfiltrarli. Resta solo l'utente, per la UI e per sapere
    // al prossimo caricamento che c'è una sessione da riprendere.
    if (!this.cookieMode) {
      this.storage.setItem(TOKEN_KEY, res.access_token);
      if (res.refresh_token) {
        this.storage.setItem(REFRESH_TOKEN_KEY, res.refresh_token);
      }
    }
    this.storage.setItem(USER_KEY, JSON.stringify(res.user));
    this._token.set(res.access_token);
    this._user.set(res.user);
  }

  private clearSession(): void {
    this.storage.removeItem(TOKEN_KEY);
    this.storage.removeItem(REFRESH_TOKEN_KEY);
    this.storage.removeItem(USER_KEY);
    this.storage.removeItem(LAST_ACTIVITY_KEY);
    this._token.set(null);
    this._user.set(null);
  }

  /** Ripristino silenzioso all'avvio (modalità cookie): mai redirect, si resta sulla pagina da anonimi. */
  private restoreFromCookie(): void {
    this.restoring.set(true);
    this.doRefresh(false).subscribe({
      next: () => this.restoring.set(false),
      error: () => this.restoring.set(false),
    });
  }

  private parseStoredUser(): User | null {
    try {
      const raw = this.storage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private readonly handleStorageSync = (event: StorageEvent): void => {
    if (event.storageArea !== localStorage) return;
    if (event.key !== TOKEN_KEY && event.key !== USER_KEY) return;

    const wasLoggedIn = this.isLoggedIn();
    const user = this.parseStoredUser();

    if (this.cookieMode) {
      // Il token non è condiviso via storage: login in un'altra scheda → la si riprende dal cookie.
      if (event.key !== USER_KEY) return;
      this._user.set(user);
      if (user && !wasLoggedIn) this.restoreFromCookie();
      if (!user) this._token.set(null);
      if (wasLoggedIn && !user && this.router.url.startsWith('/dashboard')) {
        void this.router.navigateByUrl('/dashboard/login', { replaceUrl: true });
      }
      return;
    }

    const token = this.storage.getItem(TOKEN_KEY);
    this._token.set(token);
    this._user.set(user);

    if (wasLoggedIn && !token && this.router.url.startsWith('/dashboard')) {
      void this.router.navigateByUrl('/dashboard/login', { replaceUrl: true });
    }
  };
}
