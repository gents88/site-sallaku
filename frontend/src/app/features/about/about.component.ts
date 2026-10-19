import { AfterViewInit, ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { ExperiencesService } from '../../core/services/experiences.service';
import { LanguageService, stripLangPrefix, withLangPrefix } from '../../core/services/language.service';
import { SeoService, SITE_ORIGIN } from '../../core/services/seo.service';
import { Experience } from '../../core/models/experience.model';
import { localizeExperience } from '../../core/models/localize-content';
import { revealOnScroll } from '../../core/utils/reveal-on-scroll';
import { BreadcrumbComponent, BreadcrumbItem } from '../../shared/components/breadcrumb/breadcrumb.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TrackClickDirective } from '../../shared/directives/track-click.directive';
import { LangUrlPipe } from '../../shared/pipes/lang-url.pipe';

export interface TechItem { name: string; icon: string; isFab?: boolean; }
export interface TechGroup { titleKey: string; icon: string; items: TechItem[]; }
interface ExpItem { date?: string; dateKey?: string; titleKey: string; roleKey: string; descKey: string; tags: string[]; }

/**
 * Path che aprono questa pagina e la sezione a cui scorrono. /tech-stack,
 * /experience e /skills erano ancore della home: restano validi (link
 * esterni, risultati di ricerca) e portano alla sezione giusta qui.
 */
export const ABOUT_SECTION_ROUTES: Readonly<Record<string, string>> = {
  '/tech-stack': 'tech-stack',
  '/experience': 'experience',
  '/skills': 'skills',
};

export const TECH_GROUPS: readonly TechGroup[] = [
  {
    titleKey: 'tech.frontend',
    icon: 'code',
    items: [
      { name: 'Angular', icon: 'angular', isFab: true },
      { name: 'TypeScript', icon: 'code' },
      { name: 'JavaScript', icon: 'js', isFab: true },
      { name: 'RxJS', icon: 'arrows-spin' },
      { name: 'SCSS / HTML', icon: 'sass', isFab: true },
      { name: 'React', icon: 'react', isFab: true },
    ],
  },
  {
    titleKey: 'tech.dataviz',
    icon: 'chart-line',
    items: [
      { name: 'Cesium.js', icon: 'globe' },
      { name: 'Chart.js', icon: 'chart-bar' },
      { name: 'ApexCharts', icon: 'chart-area' },
      { name: 'Photo Sphere Viewer', icon: 'vr-cardboard' },
    ],
  },
  {
    titleKey: 'tech.backend',
    icon: 'server',
    items: [
      { name: '.NET / C#', icon: 'code' },
      { name: 'Django / Python', icon: 'python', isFab: true },
      { name: 'NestJS / Node.js', icon: 'node-js', isFab: true },
      { name: 'REST API', icon: 'plug' },
    ],
  },
  {
    titleKey: 'tech.devops',
    icon: 'gears',
    items: [
      { name: 'Git', icon: 'git-alt', isFab: true },
      { name: 'CI/CD', icon: 'infinity' },
      { name: 'Docker', icon: 'docker', isFab: true },
      { name: 'Azure', icon: 'cloud' },
    ],
  },
];

const STATIC_EXPERIENCES: readonly ExpItem[] = [
  { dateKey: 'exp.current', titleKey: 'exp.1.title', roleKey: 'exp.1.role', descKey: 'exp.1.desc', tags: ['Angular', 'Cesium.js', 'TypeScript', 'RxJS', 'SCSS'] },
  { dateKey: 'exp.previous', titleKey: 'exp.2.title', roleKey: 'exp.2.role', descKey: 'exp.2.desc', tags: ['Angular', 'Looker SDK', 'Photo Sphere', 'Chart.js', 'REST API'] },
  { dateKey: 'exp.previous', titleKey: 'exp.3.title', roleKey: 'exp.3.role', descKey: 'exp.3.desc', tags: ['Angular', '.NET Core', 'Azure', 'TypeScript', 'Material'] },
  { dateKey: 'exp.previous', titleKey: 'exp.4.title', roleKey: 'exp.4.role', descKey: 'exp.4.desc', tags: ['.NET', 'Angular', 'SQL Server', 'C#', 'REST API'] },
  { date: '2018', titleKey: 'exp.5.title', roleKey: 'exp.5.role', descKey: 'exp.5.desc', tags: ['.NET', 'Angular', 'JavaScript', 'Agile/Scrum', 'Git'] },
];

/**
 * Pagina "Chi sono": bio, tecnologie, esperienza e soft skills. Prima erano
 * sezioni della home; spostate qui la home torna un'anteprima breve.
 */
@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, TranslateModule, BreadcrumbComponent, PageHeaderComponent, TrackClickDirective, LangUrlPipe],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);
  private readonly langService = inject(LanguageService);
  private readonly experiencesService = inject(ExperiencesService);

  breadcrumbItems: BreadcrumbItem[] = [];

  readonly pillars = [
    { key: 'vision', icon: 'eye' },
    { key: 'perf', icon: 'gauge-high' },
    { key: 'lead', icon: 'users-gear' },
  ];

  readonly techGroups = TECH_GROUPS;
  readonly staticExperiences = STATIC_EXPERIENCES;

  readonly softSkills = [
    { key: 'leadership', icon: 'crown' },
    { key: 'mentoring', icon: 'graduation-cap' },
    { key: 'problem', icon: 'puzzle-piece' },
    { key: 'communication', icon: 'comments' },
  ];

  /** Esperienze dal CMS, localizzate; vuoto = timeline statica tradotta via i18n. */
  private readonly experiences = signal<Experience[]>([]);
  readonly cmsExperiences = computed(() => this.experiences().map(e => localizeExperience(e, this.langService.current())));

  private stopReveal: () => void = () => {};
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.experiencesService.getAll().pipe(catchError(() => of([] as Experience[]))).subscribe(list => this.experiences.set(list));

    const lang = this.langService.current();
    // /tech-stack, /experience e /skills sono la stessa pagina: un solo canonical.
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/about', lang)}`;
    const title = this.translate.instant('about.title');
    const description = this.translate.instant('about.subtitle');
    const homeLabel = this.translate.instant('nav.home');
    this.seo.update({ title, description, url: pageUrl });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: title,
        description,
        url: pageUrl,
        mainEntity: { '@id': 'https://gentsallaku.it/#person' },
      },
      this.seo.breadcrumb([
        { name: homeLabel, url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: title, url: pageUrl },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: homeLabel, path: '/' },
      { label: title },
    ];
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.stopReveal = revealOnScroll(document);

    const sectionId = ABOUT_SECTION_ROUTES[stripLangPrefix(this.router.url.split(/[?#]/)[0]).basePath];
    if (sectionId) {
      this.scrollTimer = setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.stopReveal();
    if (this.scrollTimer !== null) clearTimeout(this.scrollTimer);
  }
}
