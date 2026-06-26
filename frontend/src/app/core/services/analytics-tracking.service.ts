import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface PageViewPayload {
  visitorId: string;
  path: string;
  referrer: string;
  language: string;
  userAgent: string;
}

interface ClickEventPayload {
  visitorId: string;
  eventType: string;
  label: string;
  path: string;
  destination?: string;
  language?: string;
}

/**
 * Lightweight page-view and click-event tracking service.
 * Sends non-blocking POSTs to /analytics/page-view and /analytics/click-event.
 * Visitor ID is persisted in localStorage (no PII stored).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsTrackingService {
  private readonly http = inject(HttpClient);
  private readonly visitorId = this.resolveVisitorId();

  track(path: string): void {
    const payload: PageViewPayload = {
      visitorId: this.visitorId,
      path,
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      language: typeof navigator !== 'undefined' ? (navigator.language ?? '') : '',
      userAgent: typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '',
    };

    // Fire-and-forget — never block the user or surface errors
    this.http
      .post(`${environment.apiUrl}/analytics/page-view`, payload)
      .subscribe({ error: () => {} });
  }

  /**
   * Track a click or interaction event.
   * @param eventType  Semantic category: 'cta' | 'affiliate' | 'social' | 'contact' | 'cv_download' | 'blog' | 'project'
   * @param label      Unique element identifier, e.g. 'hero_contact_btn'
   * @param destination Optional URL the user is navigating to (useful for affiliate links)
   */
  trackClick(eventType: string, label: string, destination?: string): void {
    const payload: ClickEventPayload = {
      visitorId: this.visitorId,
      eventType,
      label,
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
      destination,
      language: typeof navigator !== 'undefined' ? (navigator.language ?? '') : '',
    };

    this.http
      .post(`${environment.apiUrl}/analytics/click-event`, payload)
      .subscribe({ error: () => {} });
  }

  private resolveVisitorId(): string {
    if (typeof localStorage === 'undefined') return this.uuid();
    try {
      const key = '_vid';
      const stored = localStorage.getItem(key);
      if (stored) return stored;
      const id = this.uuid();
      localStorage.setItem(key, id);
      return id;
    } catch {
      return this.uuid();
    }
  }

  private uuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
