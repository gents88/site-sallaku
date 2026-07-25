import { ChangeDetectionStrategy, Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';

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
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent implements OnInit, AfterViewInit, OnDestroy {
  private observer: IntersectionObserver | null = null;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly seo = inject(SeoService);

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
    this.seo.update({
      title: 'Portfolio Projects | Gent Sallaku',
      description: 'Scopri i miei progetti principali: Cesium.js geospatial, Photo Sphere VR, data visualization, library management e security applications. Angular, TypeScript, 3D visualization.',
      url: 'https://gentsallaku.it/projects',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Portfolio Projects',
      description: 'Enterprise projects delivered in production: 3D geospatial visualization, 360° virtual tours, analytics dashboards, library management and insurance platforms.',
      url: 'https://gentsallaku.it/projects',
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      hasPart: [
        { '@type': 'CreativeWork', name: '3D Geospatial Visualization', description: 'Interactive platform for 3D geospatial visualization with real-time data on an interactive globe.', keywords: 'Cesium.js, Angular, TypeScript' },
        { '@type': 'CreativeWork', name: '360° Virtual Tour', description: 'Immersive application for virtual tours with smooth navigation between 360° environments.', keywords: 'Photo Sphere, Angular, WebGL' },
        { '@type': 'CreativeWork', name: 'Analytics Dashboard', description: 'Analytics dashboard suite with Looker Embedded and high-performance custom visualizations.', keywords: 'Looker, Angular, Chart.js' },
        { '@type': 'CreativeWork', name: 'Libraria', description: 'Digital platform for full library, catalog and lending management.', keywords: 'Angular, Node.js, PostgreSQL' },
        { '@type': 'CreativeWork', name: 'Insurance Platform', description: 'Web solution for the insurance sector with policy, claims and approval workflow management.', keywords: 'Angular, .NET, API' },
      ],
    });
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
