import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { PostSummary } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { LanguageService } from '../../../core/services/language.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatIconModule, LoadingSpinnerComponent, TranslateModule],
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

  private readonly langService = inject(LanguageService);
  readonly currentLang = this.langService.current;

  constructor(private blogService: BlogService, private seo: SeoService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.seo.update({ title: 'Blog', description: 'Articles, tutorials and insights from a developer perspective.' });
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
    return post.title;
  }

  getLocalizedExcerpt(post: PostSummary): string {
    const lang = this.currentLang();
    if (lang === 'en' && post.excerpt_en) return post.excerpt_en;
    if (lang === 'sq' && post.excerpt_sq) return post.excerpt_sq;
    return post.excerpt;
  }

  filter(): void {
    const q = this.searchQuery.toLowerCase();
    this.filteredPosts = this.posts.filter(p => {
      const matchesTag = !this.activeTag || p.tags.includes(this.activeTag);
      const matchesSearch = !q ||
        p.title.toLowerCase().includes(q) ||
        (p.title_en ?? '').toLowerCase().includes(q) ||
        (p.title_sq ?? '').toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  }

  setTag(tag: string | null): void {
    this.activeTag = tag;
    this.filter();
  }
}
