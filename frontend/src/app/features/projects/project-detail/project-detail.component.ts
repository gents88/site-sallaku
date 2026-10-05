import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project } from '../../../core/models/project.model';
import { hasCaseStudy, localizeProject } from '../../../core/models/localize-content';
import { rankRelated } from '../../../shared/utils/related-content';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * Case study di un progetto: problema → soluzione → risultati.
 * Le sezioni vuote non vengono mostrate; i testi seguono la lingua corrente
 * (traduzioni dall'admin, fallback sull'italiano).
 */
@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, TranslateModule, BreadcrumbComponent, LangUrlPipe],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailComponent {
  /** Dalla rotta, via withComponentInputBinding(). */
  readonly slug = input<string>('');

  private readonly projects = inject(ProjectsService);
  private readonly langService = inject(LanguageService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = signal<LoadState>('loading');
  private readonly raw = signal<Project | null>(null);
  private readonly allProjects = signal<Project[]>([]);

  /** Altri case study, per tecnologie in comune (a parità, l'ordine scelto in admin). */
  readonly related = computed(() => {
    const current = this.raw();
    if (!current) return [];
    const lang = this.langService.current();
    return rankRelated(current, this.allProjects().filter(hasCaseStudy), { id: p => p._id, tags: p => p.technologies })
      .map(p => localizeProject(p, lang));
  });
  readonly project = computed(() => {
    const p = this.raw();
    return p ? localizeProject(p, this.langService.current()) : null;
  });

  readonly sections = computed(() => {
    const p = this.project();
    if (!p) return [];
    return [
      { key: 'problem', titleKey: 'project_detail.problem', text: p.problem },
      { key: 'solution', titleKey: 'project_detail.solution', text: p.solution },
      { key: 'results', titleKey: 'project_detail.results', text: p.results },
    ].filter(s => !!s.text?.trim());
  });

  readonly breadcrumbItems = computed<BreadcrumbItem[]>(() => [
    { label: this.t.instant('nav.home'), path: '/' },
    { label: this.t.instant('projects.title'), path: '/projects' },
    { label: this.project()?.title ?? '' },
  ]);

  constructor() {
    effect(() => {
      const slug = this.slug();
      if (slug) this.load(slug);
    });
    // Solo nel browser, come per i post correlati: niente richiesta extra in prerender.
    if (this.isBrowser) {
      this.projects.getAll().pipe(catchError(() => of<Project[]>([]))).subscribe(list => this.allProjects.set(list));
    }
    effect(() => {
      const p = this.project();
      if (p) this.updateSeo(p);
    });
  }

  retry(): void {
    this.load(this.slug());
  }

  private load(slug: string): void {
    this.state.set('loading');
    this.projects.getBySlug(slug).pipe(
      catchError((err: { status?: number }) => {
        this.state.set(err?.status === 404 ? 'not-found' : 'error');
        return of(null);
      }),
    ).subscribe(project => {
      if (!project) return;
      this.raw.set(project);
      this.state.set('ready');
    });
  }

  private updateSeo(p: Project): void {
    const lang = this.langService.current();
    const url = `${SITE_ORIGIN}${withLangPrefix(`/projects/${p.slug}`, lang)}`;
    const description = (p.problem || p.description).slice(0, 160);
    this.seo.update({ title: p.title, description, url, image: p.images?.[0], type: 'article' });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        name: p.title,
        description: p.description,
        url,
        image: p.images?.length ? p.images : undefined,
        keywords: p.technologies.join(', '),
        author: { '@type': 'Person', name: 'Gent Sallaku', url: SITE_ORIGIN },
      },
      this.seo.breadcrumb([
        { name: this.t.instant('nav.home'), url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: this.t.instant('projects.title'), url: `${SITE_ORIGIN}${withLangPrefix('/projects', lang)}` },
        { name: p.title, url },
      ]),
    ]);
  }
}
