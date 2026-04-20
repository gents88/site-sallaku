import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Injector, OnInit, Input, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PrismService } from '../../../shared/services/prism.service';
import { TrackClickDirective } from '../../../shared/directives/track-click.directive';
import { AdUnitComponent } from '../../../shared/components/ad-unit/ad-unit.component';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, LoadingSpinnerComponent, TrackClickDirective, AdUnitComponent],
  templateUrl: './blog-detail.component.html',
  styleUrls: ['./blog-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogDetailComponent implements OnInit {
  @Input() slug!: string; // injected via withComponentInputBinding()

  post: Post | null = null;
  loading = true;
  notFound = false;

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
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: post => {
        this.post = post;
        afterNextRender(() => this.highlightCode(), { injector: this.injector });
        this.cdr.markForCheck();
        // Fire-and-forget: increment view count without blocking rendering
        this.blogService.trackView(this.slug).subscribe({ error: () => {} });
        this.seo.update({
          title: post.metaTitle || post.title,
          description: post.metaDescription || post.excerpt,
          image: post.coverImage,
          type: 'article',
          url: `https://gentsallaku.it/blog/${this.slug}`,
        });
        this.seo.injectJsonLd({
          '@context': 'https://schema.org',
          '@type': 'Article',
          '@id': `https://gentsallaku.it/blog/${this.slug}#article`,
          headline: post.metaTitle || post.title,
          description: post.metaDescription || post.excerpt,
          image: post.coverImage ? [post.coverImage] : undefined,
          url: `https://gentsallaku.it/blog/${this.slug}`,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt ?? post.publishedAt,
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `https://gentsallaku.it/blog/${this.slug}`,
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
          inLanguage: 'it',
        });
      },
      error: () => { this.notFound = true; this.cdr.markForCheck(); },
    });
  }
}
