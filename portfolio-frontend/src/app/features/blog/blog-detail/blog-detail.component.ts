import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, LoadingSpinnerComponent],
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
  readonly currentLang = this.langService.current;

  /** Returns the title in the current portal language, falling back to Italian. */
  get localizedTitle(): string {
    if (!this.post) return '';
    const lang = this.currentLang();
    if (lang === 'en' && this.post.title_en) return this.post.title_en;
    if (lang === 'sq' && this.post.title_sq) return this.post.title_sq;
    return this.post.title;
  }

  /** Returns the content in the current portal language, falling back to Italian. */
  get localizedContent(): string {
    if (!this.post) return '';
    const lang = this.currentLang();
    if (lang === 'en' && this.post.content_en) return this.post.content_en;
    if (lang === 'sq' && this.post.content_sq) return this.post.content_sq;
    return this.post.content;
  }

  constructor(private blogService: BlogService, private seo: SeoService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.blogService.getBySlug(this.slug).pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: post => {
        this.post = post;
        this.cdr.markForCheck();
        // Fire-and-forget: increment view count without blocking rendering
        this.blogService.trackView(this.slug).subscribe({ error: () => {} });
        this.seo.update({
          title: post.metaTitle || post.title,
          description: post.metaDescription || post.excerpt,
          image: post.coverImage,
          type: 'article',
        });
        this.seo.injectJsonLd({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.excerpt,
          image: post.coverImage,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
        });
      },
      error: () => { this.notFound = true; this.cdr.markForCheck(); },
    });
  }
}
