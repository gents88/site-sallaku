import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, OnInit, Input, inject, effect } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PrismService } from '../../../shared/services/prism.service';
import { TrackClickDirective } from '../../../shared/directives/track-click.directive';
import { AdUnitComponent } from '../../../shared/components/ad-unit/ad-unit.component';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { SocialShareComponent } from '../../../shared/components/social-share/social-share.component';
import { ArticleNotesComponent } from '../../../shared/components/article-notes/article-notes.component';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, MatIconModule, LoadingSpinnerComponent, TrackClickDirective, AdUnitComponent, LangUrlPipe, SocialShareComponent, ArticleNotesComponent],
  templateUrl: './blog-detail.component.html',
  styleUrls: ['./blog-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogDetailComponent implements OnInit {
  @Input() slug!: string; // injected via withComponentInputBinding()

  post: Post | null = null;
  loading = true;
  notFound = false;
  /** Self-referencing canonical URL for the current language — also fed to app-social-share. */
  pageUrl = '';

  private readonly langService = inject(LanguageService);
  private readonly el = inject(ElementRef);
  private readonly prismService = inject(PrismService);
  private readonly injector = inject(Injector);
  readonly currentLang = this.langService.current;

  /** Returns the title in the current portal language, falling back to Italian. */
  get localizedTitle(): string {
    if (!this.post) return '';
    const lang = this.currentLang();
    if (lang === 'en' && this.post.title_en) return this.post.title_en;
    if (lang === 'sq' && this.post.title_sq) return this.post.title_sq;
    if (lang === 'pt' && this.post.title_pt) return this.post.title_pt;
    if (lang === 'es' && this.post.title_es) return this.post.title_es;
    if (lang === 'fr' && this.post.title_fr) return this.post.title_fr;
    if (lang === 'de' && this.post.title_de) return this.post.title_de;
    return this.post.title;
  }

  /**
   * Title used for <title>/og:title/JSON-LD headline. In Italian, prefers the
   * curated SEO metaTitle field (schema.org has no per-language metaTitle);
   * every other language uses the real translated title instead of silently
   * falling back to the Italian metaTitle, which previously happened for
   * every non-IT visitor and for crawlers requesting the ?lang=xx variant.
   */
  get localizedMetaTitle(): string {
    if (this.currentLang() === 'it' && this.post?.metaTitle) return this.post.metaTitle;
    return this.localizedTitle;
  }

  /** Same reasoning as localizedMetaTitle, for the meta description. */
  get localizedMetaDescription(): string {
    if (this.currentLang() === 'it' && this.post?.metaDescription) return this.post.metaDescription;
    return this.localizedExcerpt;
  }

  /** Returns the excerpt/meta description in the current portal language, falling back to Italian. */
  get localizedExcerpt(): string {
    if (!this.post) return '';
    const lang = this.currentLang();
    if (lang === 'en' && this.post.excerpt_en) return this.post.excerpt_en;
    if (lang === 'sq' && this.post.excerpt_sq) return this.post.excerpt_sq;
    if (lang === 'pt' && this.post.excerpt_pt) return this.post.excerpt_pt;
    if (lang === 'es' && this.post.excerpt_es) return this.post.excerpt_es;
    if (lang === 'fr' && this.post.excerpt_fr) return this.post.excerpt_fr;
    if (lang === 'de' && this.post.excerpt_de) return this.post.excerpt_de;
    return this.post.excerpt;
  }

  /** Returns the content in the current portal language, falling back to Italian. */
  get localizedContent(): string {
    if (!this.post) return '';
    const lang = this.currentLang();
    if (lang === 'en' && this.post.content_en) return this.post.content_en;
    if (lang === 'sq' && this.post.content_sq) return this.post.content_sq;
    if (lang === 'pt' && this.post.content_pt) return this.post.content_pt;
    if (lang === 'es' && this.post.content_es) return this.post.content_es;
    if (lang === 'fr' && this.post.content_fr) return this.post.content_fr;
    if (lang === 'de' && this.post.content_de) return this.post.content_de;
    return this.post.content;
  }

  constructor(private blogService: BlogService, private seo: SeoService, private cdr: ChangeDetectorRef) {
    // Re-render when UI language changes (OnPush requires explicit trigger)
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  private highlightCode(): void {
    const article = this.el.nativeElement.querySelector('.post-article__content');
    if (!article) return;
    this.prismService.highlightAllUnder(article);
  }

  ngOnInit(): void {
    this.blogService.getBySlug(this.slug).pipe(
      // NOTE: deliberately no retry() here. Prerendering builds fetch
      // ~200+ posts (every post × every language) from the live API in
      // well under a minute, which can trip the backend's default per-IP
      // throttle (60 req/60s) — a client-side retry sounds like the fix,
      // but Angular's build-time prerenderer abandons a route after its
      // own internal stability timeout, and a retry+delay sequence that
      // outlasts it serializes a stuck loading spinner instead of either a
      // real page or a clean "not found" — worse than doing nothing. The
      // actual fix has to reduce request volume/rate at the source (raise
      // the backend throttle for this public read-only endpoint, or fetch
      // each post once and reuse it across its 7 language routes instead
      // of refetching per language) — see project memory for the tradeoff.
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: post => {
        this.post = post;
        afterNextRender(() => this.highlightCode(), { injector: this.injector });
        this.cdr.markForCheck();
        // Fire-and-forget: increment view count without blocking rendering
        this.blogService.trackView(this.slug).subscribe({ error: () => {} });
        // Self-referencing canonical: previously always pointed at the
        // Italian URL regardless of currentLang(), which was wrong for
        // every non-IT visitor/crawler once /en/, /es/... URLs became real.
        // Also fed to app-social-share so shared links point at the exact
        // language variant the visitor was actually reading.
        this.pageUrl = `${SITE_ORIGIN}${withLangPrefix('/blog/' + this.slug, this.currentLang())}`;
        const pageUrl = this.pageUrl;
        this.seo.update({
          title: this.localizedMetaTitle,
          description: this.localizedMetaDescription,
          image: post.coverImage,
          type: 'article',
          url: pageUrl,
        });
        this.seo.injectJsonLd({
          '@context': 'https://schema.org',
          '@type': 'Article',
          '@id': `${pageUrl}#article`,
          headline: this.localizedMetaTitle,
          description: this.localizedMetaDescription,
          image: post.coverImage ? [post.coverImage] : undefined,
          url: pageUrl,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt ?? post.publishedAt,
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': pageUrl,
          },
          author: {
            '@type': 'Person',
            '@id': 'https://gentsallaku.it/#person',
            name: 'Gent Sallaku',
            url: 'https://gentsallaku.it',
          },
          publisher: {
            '@type': 'Person',
            '@id': 'https://gentsallaku.it/#person',
            name: 'Gent Sallaku',
          },
          keywords: post.tags?.join(', '),
          inLanguage: this.currentLang(),
        });
      },
      error: () => { this.notFound = true; this.cdr.markForCheck(); },
    });
  }
}
