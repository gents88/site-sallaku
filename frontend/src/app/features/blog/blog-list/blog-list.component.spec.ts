import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { importProvidersFrom } from '@angular/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogListComponent } from './blog-list.component';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { PostSummary } from '../../../core/models/post.model';

/** Minimal PostSummary fixture — only the fields filter()/matchScore() read. */
function post(overrides: Partial<PostSummary>): PostSummary {
  return {
    _id: overrides.title ?? 'id',
    title: '', subtitle: '', slug: '', language: 'it', excerpt: '',
    title_en: '', title_sq: '', title_pt: '', title_es: '', title_fr: '', title_de: '',
    excerpt_en: '', excerpt_sq: '', excerpt_pt: '', excerpt_es: '', excerpt_fr: '', excerpt_de: '',
    coverImage: '', tags: [], published: true, publishedAt: null,
    metaTitle: '', metaDescription: '', createdAt: '', updatedAt: '',
    ...overrides,
  } as PostSummary;
}

describe('BlogListComponent search', () => {
  let queryParams: Record<string, string>;

  function configure(posts: PostSummary[]): BlogListComponent {
    queryParams = {};
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: BlogService, useValue: { getPublishedAll: vi.fn(() => of(posts)) } },
        {
          provide: SeoService,
          useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) },
        },
        { provide: LanguageService, useValue: { current: () => 'it' } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (k: string) => queryParams[k] ?? null } } },
        },
      ],
    });
    return TestBed.createComponent(BlogListComponent).componentInstance;
  }

  const migrationPost = post({
    title: 'Migrazione Angular da v10 a v21: Guida completa versione per versione',
    excerpt: "Migrare un'applicazione da Angular 10 ad Angular 21 significa attraversare undici major release.",
    tags: ['angular', 'migration', 'upgrade', 'typescript'],
  });
  const unrelatedPost = post({ title: 'Design system con Storybook', excerpt: 'Componenti riusabili.', tags: ['design'] });

  it('finds a post by a paraphrase that shares no contiguous phrase with the title', () => {
    const component = configure([migrationPost, unrelatedPost]);
    component.posts = [migrationPost, unrelatedPost];
    component.searchQuery = 'come aggiornare angular dal 10 al 21';

    component.filter();

    expect(component.filteredPosts).toContain(migrationPost);
    expect(component.filteredPosts).not.toContain(unrelatedPost);
  });

  it('is insensitive to word order in the query', () => {
    const component = configure([migrationPost]);
    component.posts = [migrationPost];
    component.searchQuery = 'versione per guida completa angular migrazione';

    component.filter();

    expect(component.filteredPosts).toEqual([migrationPost]);
  });

  it('ranks a title match above an excerpt/tag-only match', () => {
    const titleMatch = post({ title: 'Angular Signals spiegati bene', excerpt: '', tags: [] });
    const excerptOnlyMatch = post({ title: 'Ottimizzare le performance', excerpt: 'Un capitolo dedicato ad Angular e ai signals.', tags: [] });
    const component = configure([excerptOnlyMatch, titleMatch]);
    component.posts = [excerptOnlyMatch, titleMatch];
    component.searchQuery = 'angular signals';

    component.filter();

    expect(component.filteredPosts).toEqual([titleMatch, excerptOnlyMatch]);
  });

  it('excludes posts that match none of the query words', () => {
    const component = configure([migrationPost, unrelatedPost]);
    component.posts = [migrationPost, unrelatedPost];
    component.searchQuery = 'storybook';

    component.filter();

    expect(component.filteredPosts).toEqual([unrelatedPost]);
  });

  it('shows every post when the search box is empty, in original order', () => {
    const component = configure([migrationPost, unrelatedPost]);
    component.posts = [migrationPost, unrelatedPost];
    component.searchQuery = '';

    component.filter();

    expect(component.filteredPosts).toEqual([migrationPost, unrelatedPost]);
  });

  it('pre-fills the search box from the ?q= query param on init (SearchAction deep link)', () => {
    const component = configure([migrationPost, unrelatedPost]);
    queryParams['q'] = 'aggiornare angular';

    component.ngOnInit();

    expect(component.searchQuery).toBe('aggiornare angular');
    expect(component.filteredPosts).toEqual([migrationPost]);
  });
});
