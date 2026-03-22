import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginPayload, OtpRequestResponse, RegisterPayload, User } from '../models/user.model';

const TOKEN_KEY = 'portfolio_token';
const USER_KEY = 'portfolio_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  // Signals for reactive state
  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _user = signal<User | null>(this.parseStoredUser());

  readonly isLoggedIn = computed(() => !!this._token());
  readonly currentUser = computed(() => this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  constructor(private http: HttpClient, private router: Router) {
    window.addEventListener('storage', this.handleStorageSync);
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

  logout(redirectUrl = '/admin/login'): void {
    this.clearSession();
    void this.router.navigateByUrl(redirectUrl, { replaceUrl: true });
  }

  getToken(): string | null {
    return this._token();
  }

  private saveSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this._token.set(res.access_token);
    this._user.set(res.user);
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
  }

  private parseStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private readonly handleStorageSync = (event: StorageEvent): void => {
    if (event.storageArea !== localStorage) {
      return;
    }

    if (event.key !== TOKEN_KEY && event.key !== USER_KEY) {
      return;
    }

    const wasLoggedIn = this.isLoggedIn();
    const token = localStorage.getItem(TOKEN_KEY);
    const user = this.parseStoredUser();

    this._token.set(token);
    this._user.set(user);

    if (wasLoggedIn && !token && this.router.url.startsWith('/admin')) {
      void this.router.navigateByUrl('/admin/login', { replaceUrl: true });
    }
  };
}
