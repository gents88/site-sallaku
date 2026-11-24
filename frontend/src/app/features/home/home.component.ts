import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { finalize, forkJoin, catchError } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AboutService } from '../../core/services/about.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ExperiencesService } from '../../core/services/experiences.service';
import { TestimonialsService } from '../../core/services/testimonials.service';
import { SeoService, SITE_ORIGIN } from '../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../core/services/language.service';
import { About } from '../../core/models/about.model';
import { Project } from '../../core/models/project.model';
import { Experience } from '../../core/models/experience.model';
import { hasCaseStudy, localizeExperience, localizeProject } from '../../core/models/localize-content';
import { of } from 'rxjs';
import { TrackClickDirective } from '../../shared/directives/track-click.directive';
import { LangUrlPipe } from '../../shared/pipes/lang-url.pipe';
import { SocialShareComponent } from '../../shared/components/social-share/social-share.component';
import { TestimonialsWallComponent } from '../../shared/components/testimonials-wall/testimonials-wall.component';
import { consumePreScroll, jumpToSection, sectionForUrl } from './jump-to-section';
import { initHeroTilt } from './hero-tilt';
import { BlogService } from '../../core/services/blog.service';
import { PostSummary, localizedPostText, localizedSlug } from '../../core/models/post.model';
import { NavIconComponent } from '../../shared/components/nav-icon/nav-icon.component';
import { NAV_REGISTRY } from '../../core/navigation/nav-registry';
import { LAB_INTENTS } from '../../core/navigation/lab-intents';

interface TechItem { name: string; icon: string; isFab?: boolean; }
interface TechGroup { titleKey: string; icon: string; items: TechItem[]; }
interface ProjectItem { icon: string; tags: string[]; titleKey: string; descKey: string; featureKeys: string[]; }
interface ExpItem { date?: string; dateKey?: string; titleKey: string; roleKey: string; descKey: string; tags: string[]; }
interface FaqItem { qKey: string; aKey: string; }

/** I tag più usati negli articoli (maiuscole ignorate, vince la grafia più frequente). */
function topTags(posts: PostSummary[], max: number): string[] {
  const groups = new Map<string, { n: number; spell: Map<string, number> }>();
  for (const raw of posts.flatMap(p => p.tags ?? [])) {
    const tag = raw.trim(); const k = tag.toLowerCase();
    if (!k) continue;
    const g = groups.get(k) ?? { n: 0, spell: new Map<string, number>() };
    g.n++; g.spell.set(tag, (g.spell.get(tag) ?? 0) + 1); groups.set(k, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(g => [...g.spell].sort((a, b) => b[1] - a[1])[0][0]);
}
interface ServiceItem { key: string; icon: string; colorClass: string; route?: string; }

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, MatIconModule, TrackClickDirective, LangUrlPipe, SocialShareComponent, TestimonialsWallComponent, NavIconComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  about: About | null = null;
  featuredProjects: Project[] = [];
  experiences: Experience[] = [];
  loading = true;

  private observer: IntersectionObserver | null = null;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Toglie l'inclinazione 3D dell'hero (vedi hero-tilt.ts). */
  private stopHeroTilt: (() => void) | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  /** La sezione Testimonianze esiste solo se ce n'è almeno una pubblicata. */
  readonly hasTestimonials = inject(TestimonialsService).hasPublic();
  private readonly blogService = inject(BlogService);

  /** Gli ultimi articoli pubblicati; vuoto = la sezione non si mostra. */
  latestPosts: PostSummary[] = [];

  /** Su telefono la descrizione dell'hero è accorciata (così i pulsanti restano visibili); questo la apre. */
  heroExpanded = false;

  /**
   * Strumenti in primo piano nella home: i più cercati. Nome, descrizione e icona vengono dal registro e dai
   * testi del Lab (stessi testi del menu e delle pagine strumento), così restano allineati.
   */
  readonly labTools: { id: string; route: string; icon: string; key: string }[] = [
    { id: 'pdf-search', key: 'pdf_search' },
    { id: 'convert', key: 'convert' },
    { id: 'image-tools', key: 'image_tools' },
    { id: 'qr-code', key: 'qr_code' },
    { id: 'sign-pdf', key: 'sign_pdf' },
    { id: 'compress-pdf', key: 'compress_pdf' },
    { id: 'ocr', key: 'ocr' },
    { id: 'pdf-summary', key: 'pdf_summary' },
  ].map(t => {
    const entry = NAV_REGISTRY.find(e => e.id === t.id);
    return { ...t, route: entry?.route ?? `/lab/${t.id}`, icon: entry?.icon ?? 'layers' };
  });

  /** Strumenti veri del Lab (senza le pagine per ricerche specifiche, che riusano gli stessi). */
  readonly labToolCount = NAV_REGISTRY.filter(
    e => e.group === 'tools' && e.access === 'public' && e.route.startsWith('/lab/') && !(e.id in LAB_INTENTS),
  ).length;

  postTitle(post: PostSummary): string { return localizedPostText(post, 'title', this.langService.current()); }
  postExcerpt(post: PostSummary): string { return localizedPostText(post, 'excerpt', this.langService.current()); }
  postPath(post: PostSummary): string { return `/blog/${localizedSlug(post, this.langService.current())}`; }

  // Valori reali fin dal primo render (SSR/prerender, no-JS, reduced motion):
  // il conteggio da zero è solo un effetto aggiunto nel browser.

  /* ── Static data (identical to httpdocs/index.html) ─── */
  readonly frontendTechs: TechItem[] = [
    { name: 'Angular', icon: 'angular', isFab: true },
    { name: 'JavaScript', icon: 'js', isFab: true },
    { name: 'RxJS', icon: 'arrows-spin' },
    { name: 'SCSS / HTML', icon: 'sass', isFab: true },
    { name: 'React', icon: 'react', isFab: true },
    { name: 'TypeScript', icon: 'code' },
  ];

  readonly dataVizTechs: TechItem[] = [
    { name: 'Chart.js', icon: 'chart-bar' },
    { name: 'ApexCharts', icon: 'chart-area' },
    { name: 'Cesium.js', icon: 'globe' },
    { name: 'Photo Sphere Viewer', icon: 'vr-cardboard' },
  ];

  readonly backendTechs: TechItem[] = [
    { name: 'Django / Python', icon: 'python', isFab: true },
    { name: '.NET / C#', icon: 'code' },
    { name: 'NestJS / Node.js', icon: 'node-js', isFab: true },
    { name: 'REST API', icon: 'plug' },
  ];

  readonly devopsTechs: TechItem[] = [
    { name: 'Docker', icon: 'docker', isFab: true },
    { name: 'CI/CD', icon: 'infinity' },
    { name: 'Git', icon: 'git-alt', isFab: true },
    { name: 'Azure', icon: 'cloud' },
  ];

  /**
   * Competenze raggruppate per area, senza percentuali: un "92%" non misura
   * niente di verificabile, non è leggibile da uno screen reader e mancava nell'HTML
   * prerenderizzato (le barre partivano da larghezza 0).
   */
  readonly techGroups: TechGroup[] = [
    { titleKey: 'tech.frontend', icon: 'code', items: this.frontendTechs },
    { titleKey: 'tech.dataviz', icon: 'chart-line', items: this.dataVizTechs },
    { titleKey: 'tech.backend', icon: 'server', items: this.backendTechs },
    { titleKey: 'tech.devops', icon: 'gears', items: this.devopsTechs },
  ];

  readonly staticProjects: ProjectItem[] = [
    {
      icon: 'earth-europe',
      tags: ['Cesium.js', 'Angular', 'TypeScript'],
      titleKey: 'projects.geo.title',
      descKey: 'projects.geo.desc',
      featureKeys: ['projects.geo.f1', 'projects.geo.f2', 'projects.geo.f3', 'projects.geo.f4'],
    },
    {
      icon: 'vr-cardboard',
      tags: ['Photo Sphere', 'Angular', 'WebGL'],
      titleKey: 'projects.vr.title',
      descKey: 'projects.vr.desc',
      featureKeys: ['projects.vr.f1', 'projects.vr.f2', 'projects.vr.f3', 'projects.vr.f4'],
    },
    {
      icon: 'chart-pie',
      tags: ['Looker', 'Angular', 'Chart.js'],
      titleKey: 'projects.dash.title',
      descKey: 'projects.dash.desc',
      featureKeys: ['projects.dash.f1', 'projects.dash.f2', 'projects.dash.f3', 'projects.dash.f4'],
    },
    {
      icon: 'book-open',
      tags: ['Angular', 'Node.js', 'PostgreSQL'],
      titleKey: 'projects.lib.title',
      descKey: 'projects.lib.desc',
      featureKeys: ['projects.lib.f1', 'projects.lib.f2', 'projects.lib.f3', 'projects.lib.f4'],
    },
    {
      icon: 'shield-halved',
      tags: ['Angular', '.NET', 'API'],
      titleKey: 'projects.ins.title',
      descKey: 'projects.ins.desc',
      featureKeys: ['projects.ins.f1', 'projects.ins.f2', 'projects.ins.f3', 'projects.ins.f4'],
    },
  ];

  readonly staticExperiences: ExpItem[] = [
    {
      dateKey: 'exp.current',
      titleKey: 'exp.1.title',
      roleKey: 'exp.1.role',
      descKey: 'exp.1.desc',
      tags: ['Angular', 'Cesium.js', 'TypeScript', 'RxJS', 'SCSS'],
    },
    {
      dateKey: 'exp.previous',
      titleKey: 'exp.2.title',
      roleKey: 'exp.2.role',
      descKey: 'exp.2.desc',
      tags: ['Angular', 'Looker SDK', 'Photo Sphere', 'Chart.js', 'REST API'],
    },
    {
      dateKey: 'exp.previous',
      titleKey: 'exp.3.title',
      roleKey: 'exp.3.role',
      descKey: 'exp.3.desc',
      tags: ['Angular', '.NET Core', 'Azure', 'TypeScript', 'Material'],
    },
    {
      dateKey: 'exp.previous',
      titleKey: 'exp.4.title',
      roleKey: 'exp.4.role',
      descKey: 'exp.4.desc',
      tags: ['.NET', 'Angular', 'SQL Server', 'C#', 'REST API'],
    },
    {
      date: '2018',
      titleKey: 'exp.5.title',
      roleKey: 'exp.5.role',
      descKey: 'exp.5.desc',
      tags: ['.NET', 'Angular', 'JavaScript', 'Agile/Scrum', 'Git'],
    },
  ];

  readonly services: ServiceItem[] = [
    { key: 'pdf',      icon: 'picture_as_pdf',  colorClass: 'color-red',    route: '/lab' },
    { key: 'frontend', icon: 'web',            colorClass: 'color-blue'   },
    { key: 'web3d',    icon: 'public',          colorClass: 'color-cyan'   },
    { key: 'dataviz',  icon: 'bar_chart',       colorClass: 'color-violet' },
    { key: 'uiux',     icon: 'design_services', colorClass: 'color-pink'   },
    { key: 'perf',     icon: 'speed',           colorClass: 'color-orange' },
    { key: 'api',      icon: 'api',             colorClass: 'color-green'  },
  ];

  /** Tecnologie del sito (nomi propri, uguali in tutte le lingue): vanno nei dati strutturati, NON nella pagina. */
  readonly techTags = [
    'Angular', 'TypeScript', 'JavaScript', 'RxJS', 'SCSS', 'HTML', 'React', 'NestJS', 'Node.js', 'REST API', 'GraphQL',
    'Python', 'Django', '.NET', 'C#', 'PostgreSQL', 'Data Visualization', 'Chart.js', 'ApexCharts', 'Looker',
    '3D Web', 'Cesium.js', 'WebGL', 'Three.js', 'Docker', 'CI/CD', 'Git', 'Azure',
  ];

  readonly faqItems: FaqItem[] = [
    { qKey: 'faq.q_who', aKey: 'faq.a_who' },
    { qKey: 'faq.q1', aKey: 'faq.a1' },
    { qKey: 'faq.q2', aKey: 'faq.a2' },
    { qKey: 'faq.q_merge', aKey: 'faq.a_merge' },
    { qKey: 'faq.q_compress', aKey: 'faq.a_compress' },
    { qKey: 'faq.q_heic', aKey: 'faq.a_heic' },
    { qKey: 'faq.q_privacy', aKey: 'faq.a_privacy' },
    { qKey: 'faq.q4', aKey: 'faq.a4' },
  ];

  get displayProjects(): ProjectItem[] {
    return this.staticProjects;
  }

  /**
   * Contenuti dal CMS, localizzati. Prima la home li scaricava a ogni visita
   * ma mostrava sempre quelli statici: ora, se l'admin ne ha inseriti, sono
   * questi a comparire (con fallback statico finché il DB è vuoto).
   */
  get cmsProjects(): Project[] {
    const lang = this.langService.current();
    return this.featuredProjects.map(p => localizeProject(p, lang));
  }

  get cmsExperiences(): Experience[] {
    const lang = this.langService.current();
    return this.experiences.map(e => localizeExperience(e, lang));
  }

  readonly hasCaseStudy = hasCaseStudy;

  get displayExperiences(): ExpItem[] {
    return this.staticExperiences;
  }

  private readonly langService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  /** Self-referencing profile URL for the current language — fed to app-social-share in the about section. */
  get profileUrl(): string {
    const lang = this.langService.current();
    return `${SITE_ORIGIN}${withLangPrefix('/', lang)}`;
  }

  constructor(
    private aboutService: AboutService,
    private projectsService: ProjectsService,
    private experiencesService: ExperiencesService,
    private seo: SeoService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {
    // Re-render on language change (OnPush) so the langUrl-piped service CTA
    // link picks up the new prefix, matching blog-detail/blog-list's pattern.
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  /** Gli articoli più recenti, solo per l'elenco nei dati strutturati (non vengono mostrati). */
  private schemaPosts: PostSummary[] = [];

  /** Pagine pubbliche del Lab (strumenti e pagine per ricerca specifica), per i dati strutturati. */
  private labPages(): { name: string; url: string }[] {
    const lang = this.langService.current();
    return NAV_REGISTRY
      .filter(e => e.route.startsWith('/lab/') && e.access === 'public' && e.prerender)
      .map(e => ({ name: String(this.translate.instant(e.searchTitleKey ?? e.labelKey)), url: `${SITE_ORIGIN}${withLangPrefix(e.route, lang)}` }))
      .filter(p => p.name && !p.name.includes('.'));
  }

  /** Argomenti extra letti dal sito (tecnologie di progetti ed esperienze, tag degli articoli): vanno solo nei dati strutturati. */
  private extraTopics: string[] = [];

  /** Tecnologie fisse + argomenti letti dal sito e nomi degli strumenti del Lab, senza doppioni (maiuscole ignorate), al massimo 150. */
  private topics(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...this.techTags, ...this.extraTopics, ...this.labPages().map(p => p.name)]) {
      const k = t.trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(t.trim()); }
    }
    return out.slice(0, 150);
  }

  private addTopics(list: string[]): void {
    const before = this.topics().length;
    this.extraTopics = [...this.extraTopics, ...list];
    if (this.topics().length !== before) this.injectHomeJsonLd();
  }

  /** Dati strutturati della home. Si rigenerano quando arrivano articoli, progetti ed esperienze (sostituiscono i precedenti). */
  private injectHomeJsonLd(): void {
    // Tecnologie e argomenti che il sito mostra davvero (stack, progetti, esperienze, tag degli articoli):
    // sono dati per i motori di ricerca, non testo nascosto nella pagina.
    const topics = this.topics();
    const lang = this.langService.current();
    const labPages = this.labPages();
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': 'https://gentsallaku.it/#person',
        name: 'Gent Sallaku',
        url: 'https://gentsallaku.it',
        jobTitle: 'Senior Front-End & API Developer',
        description: 'Senior Front-End & API Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.',
        knowsAbout: topics,
        sameAs: [
          'https://github.com/gentsallaku',
          'https://linkedin.com/in/gent-sallaku',
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': 'https://gentsallaku.it/#website',
        url: 'https://gentsallaku.it',
        name: 'Gent Sallaku',
        description: 'Portfolio and blog of Gent Sallaku, Senior Front-End & API Developer',
        author: { '@id': 'https://gentsallaku.it/#person' },
        keywords: topics.slice(0, 60).join(', '),
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://gentsallaku.it/blog?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
      // Elenco degli strumenti del Lab: nome e indirizzo di ogni pagina.
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: this.translate.instant('home_v2.lab_title'),
        numberOfItems: labPages.length,
        itemListElement: labPages.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: p.url })),
      },
      // Elenco degli articoli più recenti, con estratto e tag: dice di cosa parla il blog.
      ...(this.schemaPosts.length ? [{
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: this.translate.instant('home_v2.blog_title'),
        numberOfItems: this.schemaPosts.length,
        itemListElement: this.schemaPosts.map((post, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: localizedPostText(post, 'title', lang),
          description: (localizedPostText(post, 'excerpt', lang) ?? '').slice(0, 200) || undefined,
          url: `${SITE_ORIGIN}${withLangPrefix('/blog/' + localizedSlug(post, lang), lang)}`,
        })),
      }] : []),
      // FAQPage: le stesse domande e risposte che la sezione FAQ mostra in pagina (Google lo richiede),
      // nella lingua corrente. È ciò che le chat AI citano per "chi è" e "come si fa".
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.faqItems.map(i => ({
          '@type': 'Question',
          name: this.translate.instant(i.qKey),
          acceptedAnswer: { '@type': 'Answer', text: this.translate.instant(i.aKey) },
        })),
      },
    ]);
  }

  ngOnInit(): void {
    // Stessa richiesta (e stessa cache) dell'elenco del blog: i primi 3 sono "Ultimi articoli", i tag di tutti
    // finiscono nei dati strutturati (non nella pagina).
    this.blogService.getPublished(undefined, 1, 50, this.langService.current()).pipe(
      catchError(() => of(null)),
    ).subscribe(res => {
      const posts = res?.data ?? [];
      this.latestPosts = posts.slice(0, 3);
      this.schemaPosts = posts.slice(0, 20);
      this.addTopics(topTags(posts, 40));
      this.injectHomeJsonLd();
      this.cdr.markForCheck();
    });
    // homepage/about/tech-stack/experience/skills/services all render this
    // same component (scroll-to-section deep links), so they've always
    // intentionally collapsed to one canonical rather than 9 separate ones.
    // The canonical is the language root ('/', '/en', '/de'…), which .htaccess
    // serves from <lang>/homepage/index.html. /xx/homepage stays reachable as
    // a duplicate that canonicalizes here, and hreflang (SeoService) points at
    // the same roots so canonical and alternates agree.
    const canonicalUrl = this.profileUrl;
    this.seo.update({
      // Tradotti per lingua: prima /en, /de, … avevano tutti lo stesso title
      // (inglese) e la stessa description (italiana) — duplicati per Google.
      title: this.translate.instant('page_meta.home_title'),
      description: this.translate.instant('page_meta.home_description'),
      url: canonicalUrl,
    });

    this.injectHomeJsonLd();

    forkJoin({
      about: this.aboutService.get().pipe(catchError(() => of(null))),
      projects: this.projectsService.getAll().pipe(catchError(() => of([]))),
      experiences: this.experiencesService.getAll().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ about, projects, experiences }) => {
        this.about = about;
        if (projects.length) this.featuredProjects = projects.filter((p: Project) => p.featured).slice(0, 5);
        this.addTopics([...projects, ...experiences].flatMap((x: { technologies?: string[] }) => x.technologies ?? []));
        if (experiences.length) this.experiences = experiences.slice(0, 5);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // IntersectionObserver for .reveal elements
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    document.querySelectorAll('.reveal').forEach(el => this.observer?.observe(el));

    // Hero in 3D: si inclina verso il mouse (solo con hover vero e senza "riduci movimento").
    const hero = document.getElementById('homepage');
    if (hero) this.stopHeroTilt = initHeroTilt(hero);

    // /about → #about, /tech-stack → #tech-stack ecc., anche con il prefisso lingua
    // (prima /en/about restava sull'hero). Al caricamento diretto la pagina è già
    // stata posizionata dallo script inline di index.html, prima del primo paint.
    const sectionId = sectionForUrl(this.router.url);
    if (sectionId && !consumePreScroll(document, sectionId)) {
      this.scrollTimer = setTimeout(() => jumpToSection(document, sectionId), 100);
    }
  }

  /**
   * Scroll programmato a una sezione con offset per navbar fissa.
   * Usare (click) invece di href="#id" puro evita:
   *  - l'intercettazione di Angular Router che triggera scrollPositionRestoration
   *  - il comportamento non uniforme di scroll-padding-top su iOS Safari
   */
  scrollToSection(id: string, event: Event): void {
    event.preventDefault();
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.getElementById(id);
    if (!el) return;
    // Traverse offsetParent chain to get the absolute top position from the
    // document origin. This is reliable on iOS Safari where getBoundingClientRect()
    // can be relative to the visual viewport (affected by address-bar animation /
    // momentum scroll), causing a mismatch with window.scrollY.
    let offsetTop = 0;
    let curr: HTMLElement | null = el;
    while (curr) {
      offsetTop += curr.offsetTop;
      curr = curr.offsetParent as HTMLElement | null;
    }
    // Read the actual rendered navbar height instead of a hard-coded constant
    // so the offset is correct on both desktop and mobile.
    const navbar = document.querySelector('.navbar') as HTMLElement | null;
    const NAVBAR_H = navbar ? navbar.offsetHeight : 80;
    window.scrollTo({ top: offsetTop - NAVBAR_H, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.stopHeroTilt?.();
    this.stopHeroTilt = null;
    if (this.scrollTimer !== null) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
  }

}

