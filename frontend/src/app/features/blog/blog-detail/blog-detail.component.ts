import { afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, OnChanges, OnInit, Input, SimpleChanges, inject, effect, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, Location, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { Lang, LanguageService, NON_DEFAULT_LANGS, withLangPrefix } from '../../../core/services/language.service';
import { Post, PostSummary, localizedPostText, localizedSlug } from '../../../core/models/post.model';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { PrismService } from '../../../shared/services/prism.service';
import { TrackClickDirective } from '../../../shared/directives/track-click.directive';
import { AdUnitComponent } from '../../../shared/components/ad-unit/ad-unit.component';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { SocialShareComponent } from '../../../shared/components/social-share/social-share.component';
import { ArticleNotesComponent } from '../../../shared/components/article-notes/article-notes.component';
import { estimateReadingMinutes } from '../../../shared/utils/reading-time';
import { TocEntry, addHeadingAnchors, applyHeadingIds, extractToc } from '../../../shared/utils/article-toc';
import { rankRelated } from '../../../shared/utils/related-content';
import { ViewTransitionNameDirective, ViewTransitionNameOnClickDirective } from '../../../shared/directives/view-transition-name.directive';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-blog-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, MatIconModule, TranslateModule, LoadingSpinnerComponent, TrackClickDirective, AdUnitComponent, LangUrlPipe, SocialShareComponent, ArticleNotesComponent, BreadcrumbComponent, ViewTransitionNameDirective, ViewTransitionNameOnClickDirective],
  templateUrl: './blog-detail.component.html',
  styleUrls: ['./blog-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlogDetailComponent implements OnInit, OnChanges {
  @Input() slug?: string; // injected via withComponentInputBinding(), public route
  @Input() id?: string; // injected via withComponentInputBinding(), admin preview route

  post: Post | null = null;
  loading = true;
  notFound = false;
  breadcrumbItems: BreadcrumbItem[] = [];
  /** Self-referencing canonical URL for the current language — also fed to app-social-share. */
  pageUrl = '';

  /** True when reached via the admin preview route (fetches by id, bypasses the published filter). */
  get isPreview(): boolean {
    return !!this.id;
  }

  private readonly langService = inject(LanguageService);
  private readonly el = inject(ElementRef);
  private readonly prismService = inject(PrismService);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  publishing = false;
  readonly currentLang = this.langService.current;

  /** Sezione dell'indice attualmente in lettura (scroll-spy). */
  readonly activeTocId = signal<string | null>(null);
  /** "Leggi anche": post con più tag in comune, a parità i più recenti. */
  related: PostSummary[] = [];
  private headingObserver?: IntersectionObserver;
  private postSub?: Subscription;
  private tocCache: { content: string; entries: TocEntry[] } | null = null;

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

  /** Indice dagli h2/h3 del contenuto nella lingua corrente (memorizzato per stringa). */
  get toc(): TocEntry[] {
    const content = this.localizedContent ?? '';
    if (!this.tocCache || this.tocCache.content !== content) this.tocCache = { content, entries: extractToc(content) };
    return this.tocCache.entries;
  }

  relatedTitle(post: PostSummary): string { return localizedPostText(post, 'title', this.currentLang()); }
  relatedExcerpt(post: PostSummary): string { return localizedPostText(post, 'excerpt', this.currentLang()); }
  relatedSlug(post: PostSummary): string { return localizedSlug(post, this.currentLang()); }

  /** Estimated reading time of the content in the current language. */
  get readingMinutes(): number {
    return estimateReadingMinutes(this.localizedContent);
  }

  constructor(
    private blogService: BlogService,
    private seo: SeoService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {
    // Re-render when UI language changes (OnPush requires explicit trigger)
    effect(() => {
      this.langService.current();
      this.cdr.markForCheck();
      // Cambiando lingua [innerHTML] viene riscritto: id, scroll-spy ed
      // evidenziazione del codice vanno riapplicati al nuovo contenuto.
      if (this.post) afterNextRender(() => this.enhanceContent(), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => { this.headingObserver?.disconnect(); this.postSub?.unsubscribe(); });
  }

  /** Click su una voce dell'indice: scroll fluido, hash nell'URL e focus sul titolo. */
  scrollToHeading(event: Event, id: string): void {
    if (!this.isBrowser) return;
    const heading = document.getElementById(id);
    if (!heading) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    heading.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
    history.replaceState(history.state, '', `#${id}`);
    this.activeTocId.set(id);
  }

  /** Publishes the draft being previewed, or moves a published post back to draft (admin preview route only). */
  publish(): void { this.setPublished(true); }
  unpublish(): void { this.setPublished(false); }

  private setPublished(published: boolean): void {
    if (!this.post || this.publishing) return;
    this.publishing = true;
    this.blogService.update(this.post._id, { published }).pipe(
      finalize(() => { this.publishing = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: updated => {
        this.post = { ...this.post!, published: updated.published, publishedAt: updated.publishedAt, updatedAt: updated.updatedAt };
        this.snackBar.open(published ? 'Articolo pubblicato' : 'Articolo riportato in bozza (letture conservate)', undefined, { duration: 3000 });
        this.cdr.markForCheck();
      },
      error: () => this.snackBar.open(published ? 'Pubblicazione non riuscita' : 'Operazione non riuscita', undefined, { duration: 4000 }),
    });
  }

  /** Click sul "#" di un titolo: copia il link diretto alla sezione e lo mette nell'URL. */
  copyHeadingLink(id: string, event: Event): void {
    event.preventDefault();
    history.replaceState(history.state, '', `#${id}`);
    const url = `${this.pageUrl || location.href.split('#')[0]}#${id}`;
    const done = (key: string) => this.snackBar.open(this.translate.instant(key), undefined, { duration: 2500 });
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(url).then(() => done('blog.link_copied'), () => done('blog.copy_failed'));
  }

  /**
   * Solo nel browser: in prerender sarebbe una richiesta in più per ogni
   * post × lingua, proprio quella che fa scattare il throttle del backend.
   * La lista è la stessa (in cache) della pagina /blog.
   */
  private loadRelated(post: Post): void {
    this.blogService.getPublishedAll().subscribe({
      next: posts => {
        this.related = rankRelated<PostSummary>(post, posts, {
          id: p => p._id,
          tags: p => p.tags,
          recency: p => Date.parse(p.publishedAt ?? '') || 0,
        });
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  private enhanceContent(): void {
    const article: HTMLElement | null = this.el.nativeElement.querySelector('.post-article__content');
    if (!article) return;
    // Etichette del pulsante "Copia" della toolbar Prism (di default in inglese).
    article.dataset['prismjsCopy'] = this.translate.instant('blog.copy_code');
    article.dataset['prismjsCopySuccess'] = this.translate.instant('blog.copied');
    article.dataset['prismjsCopyError'] = this.translate.instant('blog.copy_failed');
    this.prismService.highlightAllUnder(article);
    const headings = applyHeadingIds(article, this.toc);
    addHeadingAnchors(headings, this.translate.instant('blog.copy_section_link'), (id, event) => this.copyHeadingLink(id, event));
    this.observeHeadings(headings);
    // L'anchorScrolling del router scatta prima che il post sia caricato:
    // con un link diretto a /blog/x#sezione lo scroll va rifatto qui.
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) headings.find(h => h.id === hash)?.scrollIntoView({ block: 'start' });
  }

  /** Evidenzia nell'indice l'ultimo titolo superato dalla parte alta della viewport. */
  private observeHeadings(headings: HTMLElement[]): void {
    this.headingObserver?.disconnect();
    if (!headings.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<HTMLElement>();
    this.headingObserver = new IntersectionObserver(records => {
      for (const r of records) {
        if (r.isIntersecting) visible.add(r.target as HTMLElement);
        else visible.delete(r.target as HTMLElement);
      }
      const first = headings.find(h => visible.has(h));
      if (first) this.activeTocId.set(first.id);
    }, { rootMargin: '-80px 0px -65% 0px' });
    headings.forEach(h => this.headingObserver!.observe(h));
  }

  ngOnInit(): void {
    this.load();
  }

  /**
   * Da un post correlato a un altro la rotta resta blog/:slug, quindi Angular
   * riusa questo componente e cambia solo l'input: senza ricaricare qui la
   * pagina mostrerebbe ancora il post precedente.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['slug'] ?? changes['id'];
    if (change && !change.firstChange) this.load();
  }

  private load(): void {
    // Prima di azzerare lo stato: il finalize della richiesta precedente rimette loading a false.
    this.postSub?.unsubscribe();
    this.loading = true;
    this.notFound = false;
    this.post = null;
    this.related = [];
    this.activeTocId.set(null);
    this.headingObserver?.disconnect();
    const post$ = this.isPreview ? this.blogService.getOne(this.id!) : this.blogService.getBySlug(this.slug!);
    this.postSub = post$.pipe(
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
        afterNextRender(() => this.enhanceContent(), { injector: this.injector });
        this.cdr.markForCheck();
        if (this.isPreview) return; // no view tracking, canonical tags, or JSON-LD for an unpublished draft
        // Fire-and-forget: increment view count without blocking rendering.
        // Browser only — prerendering every post × language used to count
        // ~300 fake views per build (and eat into the backend throttle).
        if (this.isBrowser) {
          this.blogService.trackView(post.slug).subscribe({ error: () => {} });
          this.loadRelated(post);
        }
        // Self-referencing canonical: previously always pointed at the
        // Italian URL regardless of currentLang(), which was wrong for
        // every non-IT visitor/crawler once /en/, /es/... URLs became real.
        // Also fed to app-social-share so shared links point at the exact
        // language variant the visitor was actually reading.
        //
        // The slug itself is translated too (/sq/blog/<slug_sq>), falling
        // back to the Italian slug for languages without a translated title.
        // Old links (e.g. /sq/blog/<italian-slug>, already shared on social)
        // still resolve — the backend matches any slug — but canonical/og:url
        // point at the localized one, and the browser URL is corrected to it.
        const alternatePaths = Object.fromEntries(
          (['it', ...NON_DEFAULT_LANGS] as Lang[]).map(l => [l, `/blog/${localizedSlug(post, l)}`]),
        ) as Record<Lang, string>;
        const localizedPath = withLangPrefix(alternatePaths[this.currentLang()], this.currentLang());
        this.pageUrl = `${SITE_ORIGIN}${localizedPath}`;
        const pageUrl = this.pageUrl;
        this.seo.update({
          title: this.localizedMetaTitle,
          description: this.localizedMetaDescription,
          image: post.coverImage,
          type: 'article',
          url: pageUrl,
          alternatePaths,
        });
        if (this.isBrowser && this.slug !== localizedSlug(post, this.currentLang())) {
          this.location.replaceState(localizedPath);
        }
        const lang = this.currentLang();
        this.seo.injectJsonLd([
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
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
            inLanguage: lang,
          },
          this.seo.breadcrumb([
            { name: this.translate.instant('nav.home'), url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
            { name: 'Blog', url: `${SITE_ORIGIN}${withLangPrefix('/blog', lang)}` },
            { name: this.localizedMetaTitle, url: pageUrl },
          ]),
        ]);
        const homeLabel = this.translate.instant('nav.home');
        this.breadcrumbItems = [
          { label: homeLabel, path: '/' },
          { label: this.translate.instant('nav.blog'), path: '/blog' },
          { label: this.localizedMetaTitle },
        ];
      },
      error: () => { this.notFound = true; this.cdr.markForCheck(); },
    });
  }
}
