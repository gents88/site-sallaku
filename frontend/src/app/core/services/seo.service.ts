import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Lang, NON_DEFAULT_LANGS, stripLangPrefix, withLangPrefix } from './language.service';

export const SITE_ORIGIN = 'https://gentsallaku.it';

interface SeoData {
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
  private readonly defaultImage = 'https://gentsallaku.it/assets/og-image.png';
  private lastTrackedPath: string | null = null;

  constructor(
    private title: Title,
    private meta: Meta,
    private router: Router,
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
    const description = data.description || this.defaultDescription;
    const image       = data.image || this.defaultImage;
    const canonicalUrl = data.url ?? (() => {
      const { lang, basePath } = stripLangPrefix(this.router.url.split('?')[0]);
      return `${SITE_ORIGIN}${withLangPrefix(basePath, lang)}`;
    })();
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
   * Inject/update <link rel="alternate" hreflang="..."> tags for all 7 site
   * languages plus x-default. Updates existing elements in place (same
   * pattern as updateCanonical) rather than remove-then-recreate: the
   * prerenderer can invoke update() more than once per route, and
   * remove+recreate left stale duplicate tags behind in the static output.
   *
   * Each alternate now points at a real path-prefixed URL (/en/blog/foo,
   * /es/blog/foo, ...) that the prerenderer actually generates distinct
   * content for — not the old ?lang=xx query strings, which every page
   * ignored, making every hreflang variant resolve to identical HTML.
   * `path` may itself already carry a prefix (it's the current router URL),
   * so it's stripped back to the language-neutral basePath first to avoid
   * double-prefixing (e.g. /en/en/blog/foo).
   */
  private updateHreflang(path: string): void {
    // Runs on both server (prerender) and browser: the prerendered HTML is
    // what crawlers actually receive, so hreflang must be present there too,
    // not just injected client-side after bootstrap.
    const { basePath } = stripLangPrefix(path);
    const allLangs: Lang[] = ['it', ...NON_DEFAULT_LANGS];

    const validHreflangs = new Set(['x-default', ...allLangs]);
    // Drop any alternate-hreflang link that no longer matches our current
    // language list (e.g. a stale one left from a previous route/build).
    this.document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => {
      if (!validHreflangs.has(el.getAttribute('hreflang') ?? '')) el.remove();
    });

    const setHref = (hreflang: string, href: string) => {
      let el = this.document.querySelector(`link[rel="alternate"][hreflang="${hreflang}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = this.document.createElement('link');
        el.setAttribute('rel', 'alternate');
        el.setAttribute('hreflang', hreflang);
        this.document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    setHref('x-default', `${SITE_ORIGIN}${basePath}`);
    allLangs.forEach(lang => setHref(lang, `${SITE_ORIGIN}${withLangPrefix(basePath, lang)}`));
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

  /**
   * Google Analytics page_view only — backend page-view tracking (with dwell
   * time, UTM and admin exclusion) lives in AnalyticsTrackingService.
   */
  private trackCurrentPageView(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const currentPath = this.router.url;
    if (this.lastTrackedPath === currentPath) return;

    this.lastTrackedPath = currentPath;

    if (environment.googleAnalyticsId && typeof gtag !== 'undefined') {
      (window as any)['gtag']('config', environment.googleAnalyticsId, {
        page_path: currentPath,
      });
    }
  }
}

// Type augment for gtag
declare function gtag(...args: any[]): void;

