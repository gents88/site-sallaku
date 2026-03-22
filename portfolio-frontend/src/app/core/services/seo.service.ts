import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface SeoData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly siteName = 'Gent Sallaku';
  private readonly defaultDescription =
    'Senior Front-End & API Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.';
  private readonly defaultImage = 'https://gentsallaku.it/assets/og-image.jpg';

  constructor(
    private title: Title,
    private meta: Meta,
    private router: Router,
    private http: HttpClient,
  ) {}

  /** Call once in AppComponent — loads GA script and fires page_view on each navigation */
  trackPageViews(): void {
    if (environment.googleAnalyticsId) {
      this.loadGtag(environment.googleAnalyticsId);
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe(() => {
      this.trackBackendPageView();

      if (environment.googleAnalyticsId && typeof gtag !== 'undefined') {
        (window as any)['gtag']('config', environment.googleAnalyticsId, {
          page_path: this.router.url,
        });
      }
    });
  }

  update(data: SeoData): void {
    const pageTitle = data.title
      ? `${data.title} | ${this.siteName}`
      : `${this.siteName} | Senior Front-End & API Developer`;
    const description = data.description ?? this.defaultDescription;
    const image       = data.image ?? this.defaultImage;
    const url         = data.url ?? (typeof window !== 'undefined' ? window.location.href : '');

    // Basic
    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });

    // Open Graph
    this.meta.updateTag({ property: 'og:title',       content: pageTitle });
    this.meta.updateTag({ property: 'og:description',  content: description });
    this.meta.updateTag({ property: 'og:image',        content: image });
    this.meta.updateTag({ property: 'og:url',          content: url });
    this.meta.updateTag({ property: 'og:type',         content: data.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name',    content: this.siteName });
    this.meta.updateTag({ property: 'og:locale',       content: 'it_IT' });

    // Twitter Card
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image',       content: image });
    this.meta.updateTag({ name: 'twitter:creator',     content: '@gentsallaku' });
  }

  /** Inject JSON-LD structured data safely */
  injectJsonLd(schema: object): void {
    const id = '__json-ld__';
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = id;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(schema);
  }

  /** Track a custom event in Google Analytics 4 */
  trackEvent(action: string, params?: Record<string, unknown>): void {
    if (typeof gtag !== 'undefined') {
      (window as any)['gtag']('event', action, params ?? {});
    }
  }

  private loadGtag(id: string): void {
    if (document.getElementById('ga-script')) return; // already loaded
    const script = document.createElement('script');
    script.id = 'ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);
    (window as any)['gtag']('config', id);
  }

  private trackBackendPageView(): void {
    if (typeof window === 'undefined' || this.router.url.startsWith('/admin')) {
      return;
    }

    const visitorId = this.getVisitorId();
    const payload = {
      visitorId,
      path: this.router.url,
      referrer: document.referrer || '',
      language: document.documentElement.lang || navigator.language || '',
      userAgent: navigator.userAgent || '',
    };

    this.http.post(`${environment.apiUrl}/analytics/page-view`, payload).subscribe({
      error: () => undefined,
    });
  }

  private getVisitorId(): string {
    const storageKey = 'gs-visitor-id';
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;

    const visitorId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    localStorage.setItem(storageKey, visitorId);
    return visitorId;
  }
}

// Type augment for gtag
declare function gtag(...args: any[]): void;
