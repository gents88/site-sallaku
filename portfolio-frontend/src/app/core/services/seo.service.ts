import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

const SITE_ORIGIN = 'https://gentsallaku.it';

export interface SeoData {
  title?: string;
  description?: string;
  image?: string;
  /** Canonical URL override. If omitted, derived from current router path. */
  url?: string;
  type?: string;
  /** BCP-47 locale for og:locale, e.g. 'it_IT', 'en_US', 'sq_AL'. Defaults to 'it_IT'. */
  locale?: string;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly siteName = 'Gent Sallaku';
  private readonly defaultDescription =
    'Senior Front-End & API Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.';
  private readonly defaultImage = 'https://gentsallaku.it/assets/og-image.jpg';
  private lastTrackedPath: string | null = null;

  constructor(
    private title: Title,
    private meta: Meta,
    private router: Router,
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  /** Call once in AppComponent — loads GA script and fires page_view on each navigation */
  trackPageViews(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (environment.googleAnalyticsId) {
      this.loadGtag(environment.googleAnalyticsId);
    }

    this.trackCurrentPageView();

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe(() => {
      this.trackCurrentPageView();
    });
  }

  update(data: SeoData): void {
    const pageTitle = data.title
      ? `${data.title} | ${this.siteName}`
      : `${this.siteName} | Senior Front-End & API Developer`;
    const description = data.description ?? this.defaultDescription;
    const image       = data.image ?? this.defaultImage;
    const canonicalUrl = data.url ?? `${SITE_ORIGIN}${this.router.url.split('?')[0]}`;
    const locale      = data.locale ?? 'it_IT';

    // Basic
    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });

    // Canonical link tag
    this.updateCanonical(canonicalUrl);

    // hreflang alternate links (it / en / sq)
    this.updateHreflang(this.router.url.split('?')[0]);

    // Open Graph
    this.meta.updateTag({ property: 'og:title',       content: pageTitle });
    this.meta.updateTag({ property: 'og:description',  content: description });
    this.meta.updateTag({ property: 'og:image',        content: image });
    this.meta.updateTag({ property: 'og:url',          content: canonicalUrl });
    this.meta.updateTag({ property: 'og:type',         content: data.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name',    content: this.siteName });
    this.meta.updateTag({ property: 'og:locale',       content: locale });

    // Twitter Card
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image',       content: image });
    this.meta.updateTag({ name: 'twitter:creator',     content: '@gentsallaku' });
  }

  /**
   * Inject JSON-LD structured data.
   * Pass a single schema object or an array — each item becomes its own <script> tag.
   */
  injectJsonLd(schema: object | object[]): void {
    const schemas = Array.isArray(schema) ? schema : [schema];

    // Remove any previously injected JSON-LD tags
    this.document.querySelectorAll('script[data-json-ld]').forEach(el => el.remove());

    schemas.forEach((s, i) => {
      const el = this.document.createElement('script');
      el.setAttribute('data-json-ld', String(i));
      el.type = 'application/ld+json';
      el.textContent = JSON.stringify(s);
      this.document.head.appendChild(el);
    });
  }

  /** Track a custom event in Google Analytics 4 (browser only) */
  trackEvent(action: string, params?: Record<string, unknown>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof gtag !== 'undefined') {
      (window as any)['gtag']('event', action, params ?? {});
    }
  }

  private updateCanonical(url: string): void {
    let el = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (el) {
      el.setAttribute('href', url);
    } else {
      el = this.document.createElement('link');
      el.setAttribute('rel', 'canonical');
      el.setAttribute('href', url);
      this.document.head.appendChild(el);
    }
  }

  /**
   * Inject/update <link rel="alternate" hreflang="..."> tags for the three
   * supported languages (it, en, sq) plus x-default.
   */
  private updateHreflang(path: string): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Remove previously injected hreflang tags
    this.document.querySelectorAll('link[data-hreflang]').forEach(el => el.remove());

    const langs: { hreflang: string; lang: string }[] = [
      { hreflang: 'x-default', lang: 'it' },
      { hreflang: 'it', lang: 'it' },
      { hreflang: 'en', lang: 'en' },
      { hreflang: 'sq', lang: 'sq' },
    ];

    langs.forEach(({ hreflang, lang }) => {
      const href = `${SITE_ORIGIN}${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;
      const el = this.document.createElement('link');
      el.setAttribute('data-hreflang', hreflang);
      el.setAttribute('rel', 'alternate');
      el.setAttribute('hreflang', hreflang);
      el.setAttribute('href', hreflang === 'x-default' ? `${SITE_ORIGIN}${path}` : href);
      this.document.head.appendChild(el);
    });
  }

  private loadGtag(id: string): void {
    if (this.document.getElementById('ga-script')) return;
    const script = this.document.createElement('script');
    script.id = 'ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    this.document.head.appendChild(script);
    (window as any)['gtag']('config', id);
  }

  private trackCurrentPageView(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const currentPath = this.router.url;
    if (this.lastTrackedPath === currentPath) return;

    this.lastTrackedPath = currentPath;
    this.trackBackendPageView(currentPath);

    if (environment.googleAnalyticsId && typeof gtag !== 'undefined') {
      (window as any)['gtag']('config', environment.googleAnalyticsId, {
        page_path: currentPath,
      });
    }
  }

  private trackBackendPageView(path: string): void {
    if (!isPlatformBrowser(this.platformId) || path.startsWith('/dashboard')) return;

    const visitorId = this.getVisitorId();
    const payload = {
      visitorId,
      path,
      referrer: this.document.referrer || '',
      language: this.document.documentElement.lang || navigator.language || '',
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

    const visitorId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    localStorage.setItem(storageKey, visitorId);
    return visitorId;
  }
}

// Type augment for gtag
declare function gtag(...args: any[]): void;

