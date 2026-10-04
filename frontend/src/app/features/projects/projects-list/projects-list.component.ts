import { ChangeDetectionStrategy, Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, computed, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project } from '../../../core/models/project.model';
import { hasCaseStudy, localizeProject } from '../../../core/models/localize-content';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';

interface ProjectItem {
  icon: string;
  tags: string[];
  titleKey: string;
  descKey: string;
  featureKeys: string[];
}

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, BreadcrumbComponent, RouterLink, LangUrlPipe],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent implements OnInit, AfterViewInit, OnDestroy {
  private observer: IntersectionObserver | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(SeoService);
  private readonly langService = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly projectsService = inject(ProjectsService);
  breadcrumbItems: BreadcrumbItem[] = [];

  /**
   * Progetti gestiti dall'admin. Finché il DB è vuoto la pagina mostra i
   * progetti statici (già tradotti via i18n); appena ne esiste uno, la
   * pagina segue il CMS — prima l'admin poteva crearli ma non apparivano.
   */
  private readonly apiProjects = signal<Project[]>([]);
  readonly projects = computed(() => this.apiProjects().map(p => localizeProject(p, this.langService.current())));
  readonly selectedTech = signal<string | null>(null);
  readonly techFilters = computed(() =>
    [...new Set(this.apiProjects().flatMap(p => p.technologies))].sort((a, b) => a.localeCompare(b)),
  );
  readonly filteredProjects = computed(() => {
    const tech = this.selectedTech();
    return tech ? this.projects().filter(p => p.technologies.includes(tech)) : this.projects();
  });
  readonly hasCaseStudy = hasCaseStudy;

  toggleTech(tech: string): void {
    this.selectedTech.update(current => (current === tech ? null : tech));
  }

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

  ngOnInit(): void {
    this.projectsService.getAll().pipe(catchError(() => of([] as Project[]))).subscribe(list => this.apiProjects.set(list));

    const lang = this.langService.current();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/projects', lang)}`;
    const title = this.translate.instant('projects.title');
    const description = this.translate.instant('projects.subtitle');
    this.seo.update({
      title,
      description,
      url: pageUrl,
    });
    const homeLabel = this.translate.instant('nav.home');
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: pageUrl,
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
        hasPart: this.staticProjects.map(p => ({
          '@type': 'CreativeWork',
          name: this.translate.instant(p.titleKey),
          description: this.translate.instant(p.descKey),
          keywords: p.tags.join(', '),
        })),
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
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
