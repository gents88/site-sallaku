import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ConsentPayload {
  userId?: string | null;
  country?: string | null;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

const STORAGE_KEY = 'cookie_consent_v1';

/**
 * Single source of truth for the visitor's cookie/tracking choice.
 *
 * `state()` is null until the user has made a choice (banner still showing).
 * Any part of the app that gates behaviour on consent — analytics tracking,
 * ad units — reads the `analyticsAllowed`/`marketingAllowed` signals here
 * instead of touching localStorage directly, so there is exactly one place
 * that can get the storage key or the semantics wrong.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly endpoint = `${environment.apiUrl}/consent`;

  private readonly _state = signal<ConsentPayload | null>(this.readStored());
  readonly state = this._state.asReadonly();
  readonly analyticsAllowed = computed(() => this._state()?.analytics === true);
  readonly marketingAllowed = computed(() => this._state()?.marketing === true);
  readonly preferencesAllowed = computed(() => this._state()?.preferences === true);
  /** True once the user has made an explicit choice (accept, reject, or custom) */
  readonly hasDecided = computed(() => this._state() !== null);

  constructor(private http: HttpClient, private auth: AuthService) {
    // gtag's consent mode defaults to 'denied' on every fresh script load —
    // a returning visitor's earlier choice has to be re-applied each session.
    const stored = this._state();
    if (stored) this.updateGtagConsent(stored);
  }

  /**
   * Records the user's choice: updates the reactive state (so gated services
   * react immediately), persists it locally, mirrors it to Google Consent
   * Mode, and logs it server-side for the compliance audit trail.
   */
  setConsent(partial: { analytics: boolean; marketing: boolean; preferences: boolean }): void {
    const country = typeof window !== 'undefined' ? (window as any).__USER_COUNTRY__ ?? null : null;
    const payload: ConsentPayload = { ...partial, country };

    if (!payload.userId) {
      try {
        const raw = localStorage.getItem('portfolio_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?._id) payload.userId = u._id;
        }
      } catch { /* ignore */ }
    }

    this._state.set(payload);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
    this.updateGtagConsent(payload);
    this.persistToBackend(payload);
  }

  private persistToBackend(payload: ConsentPayload): Observable<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = this.http.post(this.endpoint, payload, { headers: new HttpHeaders(headers) }).pipe(
      catchError(() => of(null)),
    );
    req.subscribe();
    return req;
  }

  private updateGtagConsent(payload: ConsentPayload): void {
    const adGranted = payload.marketing ? 'granted' : 'denied';
    const analyticsGranted = payload.analytics ? 'granted' : 'denied';
    try {
      if ((window as any).gtag) {
        (window as any).gtag('consent', 'update', {
          ad_storage: adGranted,
          analytics_storage: analyticsGranted,
          ad_user_data: adGranted,
          ad_personalization: adGranted,
        });
      }
    } catch { /* ignore */ }

    if ((payload.analytics || payload.marketing) && (window as any).__GTM_ID__) {
      const id = (window as any).__GTM_ID__;
      if (!document.getElementById('gtm-script')) {
        const s = document.createElement('script');
        s.id = 'gtm-script';
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtm.js?id=${id}`;
        document.head.appendChild(s);
      }
    }
  }

  private readStored(): ConsentPayload | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
