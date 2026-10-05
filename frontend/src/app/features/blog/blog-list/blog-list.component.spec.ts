import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { importProvidersFrom, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogListComponent, coverHue, coverIcon, rankTags } from './blog-list.component';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { PostSummary } from '../../../core/models/post.model';
import { NetworkStatusService } from '../../../core/services/network-status.service';

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

describe('BlogListComponent prefetch', () => {
  it('warms the detail cache once per post, using the slug of the current language', () => {
    const getBySlug = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: BlogService, useValue: { getPublishedAll: vi.fn(() => of([])), getBySlug } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: () => 'sq' } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    const component = TestBed.createComponent(BlogListComponent).componentInstance;
    const p = post({ slug: 'titulli-it', slug_sq: 'titulli' } as Partial<PostSummary>);

    component.prefetch(p);
    component.prefetch(p);

    expect(getBySlug).toHaveBeenCalledTimes(1);
    expect(getBySlug).toHaveBeenCalledWith('titulli');
  });

  it('retries a prefetch that failed', () => {
    const getBySlug = vi.fn(() => throwError(() => new Error('offline')));
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: BlogService, useValue: { getPublishedAll: vi.fn(() => of([])), getBySlug } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: () => 'it' } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    const component = TestBed.createComponent(BlogListComponent).componentInstance;
    const p = post({ slug: 'a' });
    component.prefetch(p);
    component.prefetch(p);
    expect(getBySlug).toHaveBeenCalledTimes(2);
  });
});

describe('BlogListComponent offline', () => {
  function setup(getPublishedAll: () => unknown, history: { slug: string; lang: string; title: string }[] = []) {
    localStorage.setItem('gs.reading-history', JSON.stringify(history.map(h => ({ ...h, readAt: 1 }))));
    const online = signal(false);
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: BlogService, useValue: { getPublishedAll: vi.fn(getPublishedAll) } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: () => 'it' } },
        { provide: NetworkStatusService, useValue: { online } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    const fixture = TestBed.createComponent(BlogListComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, online };
  }

  afterEach(() => localStorage.clear());

  it('offers the articles already read in this language when the list cannot load', () => {
    const { el, component } = setup(() => throwError(() => new Error('offline')), [
      { slug: 'letto', lang: 'it', title: 'Articolo letto' },
      { slug: 'read', lang: 'en', title: 'Read in English' },
    ]);
    expect(component.loadError).toBe(true);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.offline-panel__list a'));
    expect(links.map(a => a.textContent?.trim())).toEqual(['Articolo letto']);
    expect(links[0].getAttribute('href')).toBe('/blog/letto');
  });

  it('explains offline reading when nothing has been read yet', () => {
    const { el } = setup(() => throwError(() => new Error('offline')));
    expect(el.querySelector('.offline-panel')?.textContent).toContain('offline.no_recent');
  });

  it('reloads the list by itself when the connection comes back', () => {
    let fail = true;
    const posts = [post({ title: 'Nuovo' })];
    const { fixture, component, online } = setup(() => (fail ? throwError(() => new Error('offline')) : of(posts)));
    expect(component.loadError).toBe(true);
    fail = false;
    online.set(true);
    TestBed.tick();
    fixture.detectChanges();
    expect(component.loadError).toBe(false);
    expect(component.posts).toEqual(posts);
  });
});

describe('BlogListComponent tags', () => {
  function configure(): BlogListComponent {
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: BlogService, useValue: { getPublishedAll: vi.fn(() => of([])) } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: () => 'it' } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    return TestBed.createComponent(BlogListComponent).componentInstance;
  }

  it('merges tags that differ only by case and keeps the most used spelling', () => {
    const tags = rankTags([
      post({ tags: ['Angular', 'PDF'] }),
      post({ tags: ['angular'] }),
      post({ tags: ['Angular'] }),
    ]);
    expect(tags).toEqual(['Angular', 'PDF']);
  });

  it('orders tags by number of posts, then alphabetically', () => {
    const tags = rankTags([
      post({ tags: ['zeta', 'beta'] }),
      post({ tags: ['zeta', 'alpha'] }),
    ]);
    expect(tags).toEqual(['zeta', 'alpha', 'beta']);
  });

  it('shows only the most used tags until expanded, and counts the hidden ones', () => {
    const component = configure();
    component.allTags = Array.from({ length: 20 }, (_, i) => `t${i}`);

    expect(component.visibleTags).toHaveLength(component.topTagCount);
    expect(component.hiddenTagCount).toBe(20 - component.topTagCount);

    component.toggleTags();
    expect(component.visibleTags).toHaveLength(20);
  });

  it('keeps the active tag visible even when it is not among the most used', () => {
    const component = configure();
    component.allTags = Array.from({ length: 20 }, (_, i) => `t${i}`);
    component.activeTag = 't19';

    expect(component.visibleTags).toContain('t19');
  });

  it('filters by tag regardless of case', () => {
    const component = configure();
    const lower = post({ title: 'a', tags: ['angular'] });
    const upper = post({ title: 'b', tags: ['Angular'] });
    const other = post({ title: 'c', tags: ['pdf'] });
    component.posts = [lower, upper, other];

    component.setTag('Angular');

    expect(component.filteredPosts).toEqual([lower, upper]);
  });
});

describe('generated covers', () => {
  it('gives the same tag the same hue, whatever the case', () => {
    expect(coverHue('Angular')).toBe(coverHue('angular'));
    expect(coverHue('Angular')).toBeGreaterThanOrEqual(0);
    expect(coverHue('Angular')).toBeLessThan(360);
  });

  it('gives different topics different hues', () => {
    expect(coverHue('PDF')).not.toBe(coverHue('SEO'));
  });

  it('picks an icon from the main topic, with a generic fallback', () => {
    expect(coverIcon('PDF')).toBe('picture_as_pdf');
    expect(coverIcon('SEO')).toBe('travel_explore');
    expect(coverIcon('Angular')).toBe('code');
    expect(coverIcon('Sicurezza')).toBe('shield');
    expect(coverIcon(undefined)).toBe('article');
    expect(coverIcon('Cucina')).toBe('article');
  });
});
