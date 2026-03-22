import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, LoadingSpinnerComponent],
  templateUrl: './blog-detail.component.html',
  styleUrls: ['./blog-detail.component.scss'],
})
export class BlogDetailComponent implements OnInit {
  @Input() slug!: string; // injected via withComponentInputBinding()

  post: Post | null = null;
  loading = true;
  notFound = false;

  constructor(private blogService: BlogService, private seo: SeoService) {}

  ngOnInit(): void {
    this.blogService.getBySlug(this.slug).pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: post => {
        this.post = post;
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
      error: () => { this.notFound = true; },
    });
  }
}
