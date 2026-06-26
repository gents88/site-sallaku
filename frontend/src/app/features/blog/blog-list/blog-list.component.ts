import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { PostSummary } from '../../../core/models/post.model';
import { LanguageService } from '../../../core/services/language.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatIconModule, TranslateModule],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogListComponent implements OnInit {
  posts: PostSummary[] = [];
  filteredPosts: PostSummary[] = [];
  allTags: string[] = [];
  activeTag: string | null = null;
  searchQuery = '';
  loading = true;

  readonly skeletonItems = Array.from({ length: 6 }, (_, i) => i);
  private pageSize = 6;
  private visibleCount = this.pageSize;

  get visiblePosts(): PostSummary[] {
    return this.filteredPosts.slice(0, this.visibleCount);
  }

  get hasMore(): boolean {
    return this.visibleCount < this.filteredPosts.length;
  }

  private readonly langService = inject(LanguageService);
  readonly currentLang = this.langService.current;

  constructor(private blogService: BlogService, private seo: SeoService, private cdr: ChangeDetectorRef) {
    // Re-render when UI language changes (OnPush requires explicit trigger)
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'Blog',
      description: 'Articles, tutorials and insights on Angular, TypeScript, NestJS, web performance, 3D visualizations and modern IT development.',
      url: 'https://gentsallaku.it/blog',
    });
    this.blogService.getPublishedAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: posts => {
        this.posts = posts;
        this.filteredPosts = posts;
        const tagsSet = new Set(posts.flatMap(p => p.tags));
        this.allTags = Array.from(tagsSet).sort();
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  getLocalizedTitle(post: PostSummary): string {
    const lang = this.currentLang();
    if (lang === 'en' && post.title_en) return post.title_en;
    if (lang === 'sq' && post.title_sq) return post.title_sq;
    if (lang === 'pt' && post.title_pt) return post.title_pt;
    if (lang === 'es' && post.title_es) return post.title_es;
    if (lang === 'fr' && post.title_fr) return post.title_fr;
    if (lang === 'de' && post.title_de) return post.title_de;
    return post.title;
  }

  getLocalizedExcerpt(post: PostSummary): string {
    const lang = this.currentLang();
    if (lang === 'en' && post.excerpt_en) return post.excerpt_en;
    if (lang === 'sq' && post.excerpt_sq) return post.excerpt_sq;
    if (lang === 'pt' && post.excerpt_pt) return post.excerpt_pt;
    if (lang === 'es' && post.excerpt_es) return post.excerpt_es;
    if (lang === 'fr' && post.excerpt_fr) return post.excerpt_fr;
    if (lang === 'de' && post.excerpt_de) return post.excerpt_de;
    return post.excerpt;
  }

  filter(): void {
    const q = this.searchQuery.toLowerCase();
    this.filteredPosts = this.posts.filter(p => {
      const matchesTag = !this.activeTag || p.tags.includes(this.activeTag);
      const matchesSearch = !q ||
        p.title.toLowerCase().includes(q) ||
        (p.title_en ?? '').toLowerCase().includes(q) ||
        (p.title_sq ?? '').toLowerCase().includes(q) ||
        (p.title_pt ?? '').toLowerCase().includes(q) ||
        (p.title_es ?? '').toLowerCase().includes(q) ||
        (p.title_fr ?? '').toLowerCase().includes(q) ||
        (p.title_de ?? '').toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
    this.visibleCount = this.pageSize;
    this.cdr.markForCheck();
  }

  setTag(tag: string | null): void {
    this.activeTag = tag;
    this.visibleCount = this.pageSize;
    this.filter();
  }

  loadMore(): void {
    this.visibleCount += this.pageSize;
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.activeTag = null;
    this.visibleCount = this.pageSize;
    this.filter();
  }
}
