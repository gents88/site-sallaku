import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { PostSummary } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatIconModule, LoadingSpinnerComponent],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.scss'],
})
export class BlogListComponent implements OnInit {
  posts: PostSummary[] = [];
  filteredPosts: PostSummary[] = [];
  allTags: string[] = [];
  activeTag: string | null = null;
  searchQuery = '';
  loading = true;

  constructor(private blogService: BlogService, private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.update({ title: 'Blog', description: 'Articles, tutorials and insights from a developer perspective.' });
    this.blogService.getPublished().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: posts => {
        this.posts = posts;
        this.filteredPosts = posts;
        const tagsSet = new Set(posts.flatMap(p => p.tags));
        this.allTags = Array.from(tagsSet).sort();
      },
      error: () => {},
    });
  }

  filter(): void {
    this.filteredPosts = this.posts.filter(p => {
      const matchesTag = !this.activeTag || p.tags.includes(this.activeTag);
      const matchesSearch = !this.searchQuery ||
        p.title.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchesTag && matchesSearch;
    });
  }

  setTag(tag: string | null): void {
    this.activeTag = tag;
    this.filter();
  }
}
