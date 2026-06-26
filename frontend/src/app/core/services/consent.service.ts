import { Injectable } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly endpoint = `${environment.apiUrl}/consent`;

  constructor(private http: HttpClient, private auth: AuthService) {}

  saveConsent(payload: ConsentPayload): Observable<any> {
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    const token = this.auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // attach userId if available
    if (!payload.userId) {
      try {
        const raw = localStorage.getItem('portfolio_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && u._id) payload.userId = u._id;
        }
      } catch (e) {}
    }

    return this.http.post(this.endpoint, payload, { headers: new HttpHeaders(headers) }).pipe(
      catchError(() => of(null)),
    );
  }

  updateGtagConsent(payload: ConsentPayload): void {
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
    } catch (e) { /* ignore */ }

    // Load GTM if necessary
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
}
