import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { PostSummary, localizedSlug } from '../../../core/models/post.model';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { NewsletterSignupComponent } from '../../../shared/components/newsletter-signup/newsletter-signup.component';
import { ViewTransitionNameOnClickDirective } from '../../../shared/directives/view-transition-name.directive';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { ReadEntry, ReadingHistoryService } from '../../../core/services/reading-history.service';

@Component({
  selector: 'app-blog-list',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, FormsModule, MatIconModule, TranslateModule, LangUrlPipe, BreadcrumbComponent, NewsletterSignupComponent, ViewTransitionNameOnClickDirective],
  templateUrl: './blog-list.component.html',
  styleUrls: ['./blog-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogListComponent implements OnInit {
  breadcrumbItems: BreadcrumbItem[] = [];
  posts: PostSummary[] = [];
  filteredPosts: PostSummary[] = [];
  allTags: string[] = [];
  activeTag: string | null = null;
  searchQuery = '';
  loading = true;
  /** La lista non è arrivata (tipicamente: offline senza copia in cache). */
  loadError = false;
  readonly network = inject(NetworkStatusService);
  private readonly readingHistory = inject(ReadingHistoryService);
  /** Articoli già letti in questa lingua: quelli che il service worker può servire offline. */
  get readOffline(): ReadEntry[] { return this.readingHistory.forLang(this.currentLang()); }

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
  private readonly route = inject(ActivatedRoute);
  readonly currentLang = this.langService.current;

  constructor(
    private blogService: BlogService,
    private seo: SeoService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {
    // Re-render when UI language changes (OnPush requires explicit trigger)
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
    // Tornata la connessione, il pannello offline si rimpiazza da solo con la lista.
    effect(() => { if (this.network.online() && this.loadError) this.reload(); });
  }

  ngOnInit(): void {
    const lang = this.currentLang();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/blog', lang)}`;
    this.seo.update({
      title: 'Blog',
      description: 'Articles, tutorials and insights on Angular, TypeScript, NestJS, web performance, 3D visualizations and modern IT development.',
      url: pageUrl,
    });
    const homeLabel = this.translate.instant('nav.home');
    const blogLabel = this.translate.instant('nav.blog');
    this.seo.injectJsonLd(
      this.seo.breadcrumb([
        { name: homeLabel, url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: blogLabel, url: pageUrl },
      ]),
    );
    this.breadcrumbItems = [
      { label: homeLabel, path: '/' },
      { label: blogLabel },
    ];
    // Pre-fills the search box from ?q= — the WebSite JSON-LD's SearchAction
    // (see home.component.ts) tells Google this URL performs a search;
    // without reading it back here that was a dead promise, so a visitor
    // arriving via Google's sitelinks search box saw the full unfiltered list.
    this.searchQuery = this.route.snapshot.queryParamMap.get('q') ?? '';

    this.fetchPosts();
  }

  /** "Riprova" del pannello offline. */
  reload(): void {
    this.loading = true;
    this.loadError = false;
    this.fetchPosts();
  }

  private fetchPosts(): void {
    this.blogService.getPublishedAll().pipe(
      // No retry() — see blog-detail.component.ts for why: it trades a
      // clean failure for a worse one (page stuck on the loading spinner)
      // once Angular's prerenderer stops waiting on this route.
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: posts => {
        this.loadError = false;
        this.posts = posts;
        const tagsSet = new Set(posts.flatMap(p => p.tags));
        this.allTags = Array.from(tagsSet).sort();
        this.filter();
      },
      error: () => { this.loadError = true; },
    });
  }

  private readonly prefetched = new Set<string>();

  /**
   * Scalda la cache del post mentre il puntatore è sulla card: all'apertura
   * il dettaglio è già pronto e la view transition trova subito il titolo.
   */
  prefetch(post: PostSummary): void {
    const slug = this.postSlug(post);
    if (this.prefetched.has(slug)) return;
    this.prefetched.add(slug);
    this.blogService.getBySlug(slug).subscribe({ error: () => this.prefetched.delete(slug) });
  }

  /** URL slug in the current language, so /sq/blog/... links carry the Albanian slug. */
  postSlug(post: PostSummary): string {
    return localizedSlug(post, this.currentLang());
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
    const tokens = this.searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let posts = this.posts.filter(p => !this.activeTag || p.tags.includes(this.activeTag));

    if (tokens.length > 0) {
      // Score by per-word overlap across title (weighted higher) + excerpt/tags,
      // instead of requiring the whole query as one literal substring of the
      // title only. That old rule meant a paraphrase like "come aggiornare
      // angular dal 11 al 21" found nothing for a post titled "Migrazione
      // Angular da v10 a v21", even though every meaningful word overlaps.
      posts = posts
        .map(p => ({ post: p, score: this.matchScore(p, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ post }) => post);
    }

    this.filteredPosts = posts;
    this.visibleCount = this.pageSize;
    this.cdr.markForCheck();
  }

  private matchScore(post: PostSummary, tokens: string[]): number {
    const titleHaystack = [post.title, post.title_en, post.title_sq, post.title_pt, post.title_es, post.title_fr, post.title_de]
      .filter(Boolean).join(' ').toLowerCase();
    const bodyHaystack = [post.excerpt, post.excerpt_en, post.excerpt_sq, post.excerpt_pt, post.excerpt_es, post.excerpt_fr, post.excerpt_de, ...(post.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase();
    return tokens.reduce((total, token) => {
      if (titleHaystack.includes(token)) return total + 2;
      if (bodyHaystack.includes(token)) return total + 1;
      return total;
    }, 0);
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
