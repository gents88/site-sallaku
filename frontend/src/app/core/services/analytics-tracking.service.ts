import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface PageViewPayload {
  visitorId: string;
  path: string;
  referrer: string;
  language: string;
  userAgent: string;
  viewId: string;
  sessionId: string;
  navigationType: 'entry' | 'internal';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

interface ClickEventPayload {
  visitorId: string;
  eventType: string;
  label: string;
  path: string;
  destination?: string;
  language?: string;
}

/** In-progress view whose dwell time is still being accumulated */
interface ActiveView {
  viewId: string;
  /** Active (visible) time accumulated so far, excluding time in background tabs */
  accumulatedMs: number;
  /** Start of the current visible segment, null while the tab is hidden */
  segmentStartedAt: number | null;
}

const VISITOR_ID_KEY = 'gs-visitor-id'; // canonical key, already present for existing visitors
const LEGACY_VISITOR_ID_KEY = '_vid';
const SESSION_ID_KEY = 'gs-session-id';

/**
 * Single owner of backend analytics: page views (with dwell time, UTM and
 * session correlation) and click events.
 *
 * Tracking is skipped entirely for the /dashboard area and for logged-in
 * admins. The frontend skip is a bandwidth optimization — the authoritative
 * filter is the AdminTrackingBypassInterceptor on the NestJS side, which reads
 * the JWT attached by the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsTrackingService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly visitorId = this.resolveVisitorId();
  private readonly sessionId = this.resolveSessionId();

  private activeView: ActiveView | null = null;
  private lastTrackedUrl: string | null = null;
  private initialized = false;
  /** False until the first tracked view — that one is the session's external entry */
  private entryTracked = false;

  /** Call once from AppComponent — wires router navigation and page-leave events. */
  init(): void {
    if (!isPlatformBrowser(this.platformId) || this.initialized) return;
    this.initialized = true;

    this.trackNavigation(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.trackNavigation(e.urlAfterRedirects));

    // Dwell time bookkeeping: pause while the tab is hidden, flush on unload.
    this.document.addEventListener('visibilitychange', () => {
      if (this.document.visibilityState === 'hidden') {
        this.pauseActiveView();
        this.flushActiveView(true /* keepalive */, false /* keep view open */);
      } else {
        this.resumeActiveView();
      }
    });
    window.addEventListener('pagehide', () => this.flushActiveView(true, true));
  }

  /**
   * Track a click or interaction event.
   * @param eventType  Semantic category: 'cta' | 'affiliate' | 'social' | 'contact' | 'cv_download' | 'blog' | 'project'
   * @param label      Unique element identifier, e.g. 'hero_contact_btn'
   * @param destination Optional URL the user is navigating to (useful for affiliate links)
   */
  trackClick(eventType: string, label: string, destination?: string): void {
    if (!isPlatformBrowser(this.platformId) || this.auth.isAdmin()) return;

    const payload: ClickEventPayload = {
      visitorId: this.visitorId,
      eventType,
      label,
      path: this.router.url.split('?')[0],
      destination,
      language: navigator.language ?? '',
    };

    // Fire-and-forget — never block the user or surface errors
    this.http
      .post(`${environment.apiUrl}/analytics/click-event`, payload)
      .subscribe({ error: () => {} });
  }

  // ── Page-view pipeline ─────────────────────────────────────────────────

  private trackNavigation(url: string): void {
    if (url === this.lastTrackedUrl) return;

    // Close the previous page's dwell-time window before opening a new one
    this.flushActiveView(false, true);
    this.lastTrackedUrl = url;

    // Admin sessions and the admin area itself are never tracked
    const path = url.split('?')[0];
    if (path.startsWith('/dashboard') || this.auth.isAdmin()) return;

    const viewId = this.uuid();
    const isFirstView = !this.entryTracked;

    const payload: PageViewPayload = {
      visitorId: this.visitorId,
      path,
      referrer: isFirstView ? (this.document.referrer || '') : '',
      language: this.document.documentElement.lang || navigator.language || '',
      userAgent: navigator.userAgent ?? '',
      viewId,
      sessionId: this.sessionId,
      navigationType: isFirstView ? 'entry' : 'internal',
      ...this.extractUtmParams(url),
    };

    this.activeView = { viewId, accumulatedMs: 0, segmentStartedAt: Date.now() };
    this.entryTracked = true;

    this.http
      .post(`${environment.apiUrl}/analytics/page-view`, payload)
      .subscribe({ error: () => {} });
  }

  private extractUtmParams(url: string): Pick<PageViewPayload, 'utmSource' | 'utmMedium' | 'utmCampaign'> {
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return {};
    const params = new URLSearchParams(url.slice(queryStart + 1));
    const pick = (key: string) => params.get(key)?.slice(0, 100) || undefined;
    return {
      utmSource: pick('utm_source'),
      utmMedium: pick('utm_medium'),
      utmCampaign: pick('utm_campaign'),
    };
  }

  // ── Dwell-time bookkeeping ─────────────────────────────────────────────

  private pauseActiveView(): void {
    if (!this.activeView || this.activeView.segmentStartedAt == null) return;
    this.activeView.accumulatedMs += Date.now() - this.activeView.segmentStartedAt;
    this.activeView.segmentStartedAt = null;
  }

  private resumeActiveView(): void {
    if (this.activeView && this.activeView.segmentStartedAt == null) {
      this.activeView.segmentStartedAt = Date.now();
    }
  }

  /**
   * Report accumulated dwell time for the current view. The backend applies it
   * with $max, so repeated flushes (tab hidden, then unload) only increase it.
   */
  private flushActiveView(useKeepalive: boolean, closeView: boolean): void {
    const view = this.activeView;
    if (!view) return;

    let durationMs = view.accumulatedMs;
    if (view.segmentStartedAt != null) durationMs += Date.now() - view.segmentStartedAt;
    durationMs = Math.min(Math.round(durationMs), 30 * 60 * 1000);

    if (closeView) this.activeView = null;

    if (durationMs <= 0) return;
    const body = JSON.stringify({ viewId: view.viewId, durationMs });
    const url = `${environment.apiUrl}/analytics/page-leave`;

    if (useKeepalive) {
      // keepalive fetch survives page unload; the auth token is not attached here,
      // but the paired page-view was already filtered for admins server-side.
      try {
        fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch(() => {});
      } catch { /* ignore */ }
    } else {
      this.http.post(url, JSON.parse(body)).subscribe({ error: () => {} });
    }
  }

  // ── Identity helpers ───────────────────────────────────────────────────

  private resolveVisitorId(): string {
    if (typeof localStorage === 'undefined') return this.uuid();
    try {
      const stored = localStorage.getItem(VISITOR_ID_KEY) || localStorage.getItem(LEGACY_VISITOR_ID_KEY);
      // The backend DTO enforces UUID v4 — regenerate legacy "visitor-…" fallback ids
      if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
        localStorage.setItem(VISITOR_ID_KEY, stored);
        return stored;
      }
      const id = this.uuid();
      localStorage.setItem(VISITOR_ID_KEY, id);
      return id;
    } catch {
      return this.uuid();
    }
  }

  private resolveSessionId(): string {
    if (typeof sessionStorage === 'undefined') return this.uuid();
    try {
      const stored = sessionStorage.getItem(SESSION_ID_KEY);
      if (stored) return stored;
      const id = this.uuid();
      sessionStorage.setItem(SESSION_ID_KEY, id);
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
