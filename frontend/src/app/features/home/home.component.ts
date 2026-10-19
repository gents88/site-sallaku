import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, effect, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectsService } from '../../core/services/projects.service';
import { SeoService, SITE_ORIGIN } from '../../core/services/seo.service';
import { LanguageService, stripLangPrefix, withLangPrefix } from '../../core/services/language.service';
import { Project } from '../../core/models/project.model';
import { hasCaseStudy, localizeProject } from '../../core/models/localize-content';
import { revealOnScroll } from '../../core/utils/reveal-on-scroll';
import { TrackClickDirective } from '../../shared/directives/track-click.directive';
import { LangUrlPipe } from '../../shared/pipes/lang-url.pipe';
import { TestimonialsWallComponent } from '../../shared/components/testimonials-wall/testimonials-wall.component';
import { ProfilePhotoComponent } from '../../shared/components/profile-photo/profile-photo.component';
import { STATIC_PROJECTS } from '../projects/static-projects';

interface FaqItem { qKey: string; aKey: string; }
interface ServiceItem { key: string; icon: string; colorClass: string; route?: string; }

/** Valori della striscia KPI nell'hero (anni, progetti, aziende, % latenza). */
export const KPI_TARGETS: readonly number[] = [8, 20, 4, 70];

/** Progetti in home: un'anteprima, l'elenco completo è su /projects. */
export const HOME_PROJECTS_LIMIT = 3;

/**
 * Sezioni della home raggiungibili da un path proprio (/services → #services).
 * Chi sono, tecnologie, esperienza e soft skills hanno ora una pagina loro
 * (AboutComponent): prima la home le conteneva tutte ed era lunga 26 schermate
 * su mobile.
 */
const SECTION_ROUTES: Record<string, string> = {
  '/services': 'services',
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, MatIconModule, TrackClickDirective, LangUrlPipe, TestimonialsWallComponent, ProfilePhotoComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  featuredProjects: Project[] = [];

  /** La sezione testimonianze resta nascosta finché il muro non ne carica almeno una. */
  readonly hasTestimonials = signal(false);

  /**
   * Partono dai valori reali, non da 0: l'HTML prerenderizzato (Google,
   * anteprime dei link, chi ha JS lento) mostrava "0+ anni di esperienza".
   */
  kpiValues = [...KPI_TARGETS];

  private stopReveal: () => void = () => {};
  private kpiObserver: IntersectionObserver | null = null;
  private kpiArmed = false;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly langService = inject(LanguageService);

  readonly staticProjects = STATIC_PROJECTS.slice(0, HOME_PROJECTS_LIMIT);

  readonly services: ServiceItem[] = [
    { key: 'pdf',      icon: 'picture_as_pdf',  colorClass: 'color-red',    route: '/lab' },
    { key: 'frontend', icon: 'web',            colorClass: 'color-blue'   },
    { key: 'web3d',    icon: 'public',          colorClass: 'color-cyan'   },
    { key: 'dataviz',  icon: 'bar_chart',       colorClass: 'color-violet' },
    { key: 'uiux',     icon: 'design_services', colorClass: 'color-pink'   },
    { key: 'perf',     icon: 'speed',           colorClass: 'color-orange' },
    { key: 'api',      icon: 'api',             colorClass: 'color-green'  },
  ];

  readonly faqItems: FaqItem[] = [
    { qKey: 'faq.q1', aKey: 'faq.a1' },
    { qKey: 'faq.q2', aKey: 'faq.a2' },
    { qKey: 'faq.q3', aKey: 'faq.a3' },
    { qKey: 'faq.q4', aKey: 'faq.a4' },
  ];

  /**
   * Progetti dal CMS, localizzati: se l'admin ne ha messi in evidenza, la home
   * mostra quelli (con le immagini), altrimenti l'anteprima statica.
   */
  get cmsProjects(): Project[] {
    const lang = this.langService.current();
    return this.featuredProjects.map(p => localizeProject(p, lang));
  }

  readonly hasCaseStudy = hasCaseStudy;

  /** URL canonico della home nella lingua corrente. */
  get profileUrl(): string {
    const lang = this.langService.current();
    return lang === 'it' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${withLangPrefix('/homepage', lang)}`;
  }

  constructor(
    private projectsService: ProjectsService,
    private seo: SeoService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {
    // Re-render on language change (OnPush) so the langUrl-piped service CTA
    // link picks up the new prefix, matching blog-detail/blog-list's pattern.
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  ngOnInit(): void {
    // homepage e services renderizzano questo componente (deep link a una
    // sezione), quindi condividono un solo canonical. Per l'italiano è la
    // radice ('/', riscritta su homepage/index.html da .htaccess); le altre
    // lingue non hanno quella riscrittura e puntano al proprio /xx/homepage.
    this.seo.update({
      title: 'Senior Front-End & API Developer',
      description: 'Senior Front-End Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.',
      url: this.profileUrl,
    });

    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': 'https://gentsallaku.it/#person',
        name: 'Gent Sallaku',
        url: 'https://gentsallaku.it',
        jobTitle: 'Senior Front-End & API Developer',
        description: 'Senior Front-End & API Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.',
        knowsAbout: ['Angular', 'TypeScript', 'JavaScript', 'NestJS', 'Django', 'Cesium.js', 'Data Visualization', 'REST API', 'Docker'],
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
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://gentsallaku.it/blog?q={search_term_string}',
          },
          'query-input': 'required name=search_term_string',
        },
      },
    ]);

    this.projectsService.getAll().pipe(catchError(() => of([] as Project[]))).subscribe(projects => {
      this.featuredProjects = projects.filter(p => p.featured).slice(0, HOME_PROJECTS_LIMIT);
      this.cdr.markForCheck();
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.stopReveal = revealOnScroll(document);
    this.setupKpiCountUp();

    // /services → #services
    const sectionId = SECTION_ROUTES[stripLangPrefix(this.router.url.split(/[?#]/)[0]).basePath];
    if (sectionId) {
      this.scrollTimer = setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  /**
   * Il conteggio da 0 ha senso solo se la striscia non è ancora a schermo:
   * se lo è già al caricamento (desktop), azzerarla farebbe sparire per un
   * attimo i numeri appena mostrati. Niente animazione con reduced motion.
   */
  private setupKpiCountUp(): void {
    const kpiEl = document.querySelector('.hero-kpis');
    if (!kpiEl || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    this.kpiObserver = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (!this.kpiArmed) {
          this.kpiArmed = true;
          if (entry.isIntersecting) {
            this.kpiObserver?.disconnect();
            return;
          }
          this.kpiValues = KPI_TARGETS.map(() => 0);
          this.cdr.markForCheck();
          return;
        }
        if (entry.intersectionRatio >= 0.5) {
          this.kpiObserver?.disconnect();
          this.animateCountUp();
        }
      },
      { threshold: [0, 0.5] },
    );
    this.kpiObserver.observe(kpiEl);
  }

  private animateCountUp(): void {
    const duration = 1500;
    const start = performance.now();
    const update = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      this.kpiValues = KPI_TARGETS.map(t => Math.floor(t * ease));
      this.cdr.markForCheck();
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
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
    this.stopReveal();
    this.kpiObserver?.disconnect();
    if (this.scrollTimer !== null) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
  }
}
