import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AboutService } from '../../core/services/about.service';
import { ContactService } from '../../core/services/contact.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ExperiencesService } from '../../core/services/experiences.service';
import { SeoService } from '../../core/services/seo.service';
import { SnackbarService } from '../../core/services/snackbar.service';
import { About } from '../../core/models/about.model';
import { Project } from '../../core/models/project.model';
import { Experience } from '../../core/models/experience.model';

interface TechItem { name: string; icon: string; level: number; isFab?: boolean; }
interface ProjectItem { icon: string; tags: string[]; titleKey: string; descKey: string; featureKeys: string[]; }
interface ExpItem { date?: string; dateKey?: string; titleKey: string; roleKey: string; descKey: string; tags: string[]; }
interface FaqItem { qKey: string; aKey: string; }

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  about: About | null = null;
  featuredProjects: Project[] = [];
  experiences: Experience[] = [];
  loading = true;
  barsFilled = false;
  contactSent = false;
  contactSending = false;
  contactError = false;
  contactInvalid = false;
  honeypot = '';
  contactForm = { name: '', email: '', message: '' };

  private observer: IntersectionObserver | null = null;
  private readonly platformId = inject(PLATFORM_ID);

  /* ── Static data (identical to httpdocs/index.html) ─── */
  readonly frontendTechs: TechItem[] = [
    { name: 'Angular', icon: 'angular', level: 95, isFab: true },
    { name: 'JavaScript', icon: 'js', level: 93, isFab: true },
    { name: 'RxJS', icon: 'arrows-spin', level: 90 },
    { name: 'SCSS / HTML', icon: 'sass', level: 90, isFab: true },
    { name: 'React', icon: 'react', level: 75, isFab: true },
    { name: 'TypeScript', icon: 'code', level: 92 },
  ];

  readonly dataVizTechs: TechItem[] = [
    { name: 'Chart.js', icon: 'chart-bar', level: 88 },
    { name: 'ApexCharts', icon: 'chart-area', level: 85 },
    { name: 'Cesium.js', icon: 'globe', level: 90 },
    { name: 'Photo Sphere Viewer', icon: 'vr-cardboard', level: 82 },
  ];

  readonly backendTechs: TechItem[] = [
    { name: 'Django / Python', icon: 'python', level: 85, isFab: true },
    { name: '.NET / C#', icon: 'code', level: 88 },
    { name: 'NestJS / Node.js', icon: 'node-js', level: 78, isFab: true },
    { name: 'REST API', icon: 'plug', level: 92 },
  ];

  readonly devopsTechs: TechItem[] = [
    { name: 'Docker', icon: 'docker', level: 80, isFab: true },
    { name: 'CI/CD', icon: 'infinity', level: 85 },
    { name: 'Git', icon: 'git-alt', level: 92, isFab: true },
    { name: 'Azure', icon: 'cloud', level: 75 },
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

  readonly faqItems: FaqItem[] = [
    { qKey: 'faq.q1', aKey: 'faq.a1' },
    { qKey: 'faq.q2', aKey: 'faq.a2' },
    { qKey: 'faq.q3', aKey: 'faq.a3' },
    { qKey: 'faq.q4', aKey: 'faq.a4' },
  ];

  get displayProjects(): ProjectItem[] {
    return this.staticProjects;
  }

  get displayExperiences(): ExpItem[] {
    return this.staticExperiences;
  }

  constructor(
    private aboutService: AboutService,
    private contactService: ContactService,
    private projectsService: ProjectsService,
    private experiencesService: ExperiencesService,
    private seo: SeoService,
    private snackbar: SnackbarService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.seo.update({
      title: 'Gent Sallaku | Senior Front-End & API Developer',
      description: 'Senior Front-End Developer specializzato in Angular, TypeScript, data visualization 3D e architetture enterprise.',
      url: 'https://gentsallaku.it/',
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
          'https://linkedin.com/in/gentsallaku',
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

    forkJoin({
      about: this.aboutService.get(),
      projects: this.projectsService.getAll(),
      experiences: this.experiencesService.getAll(),
    }).subscribe({
      next: ({ about, projects, experiences }) => {
        this.about = about;
        if (projects.length) this.featuredProjects = projects.filter(p => p.featured).slice(0, 5);
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
            // Trigger tech bars when tech section becomes visible
            if ((entry.target as HTMLElement).closest('#tech-stack')) {
              this.barsFilled = true;
              this.cdr.markForCheck();
            }
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    document.querySelectorAll('.reveal').forEach(el => this.observer?.observe(el));

    // Scroll to section based on current route: /about → #about, /tech-stack → #tech-stack etc.
    const urlPath = this.router.url.split('?')[0].replace(/^\//,'');
    const sectionMap: Record<string, string> = {
      'about': 'about',
      'tech-stack': 'tech-stack',
      'experience': 'experience',
      'skills': 'skills',
    };
    const sectionId = sectionMap[urlPath];
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  submitContact(): void {
    if (this.honeypot || this.contactSending) return; // spam trap
    const { name, email, message } = this.contactForm;
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    const normalizedMessage = message.trim();
    const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

    this.contactSent = false;
    this.contactError = false;
    this.contactInvalid = false;

    if (!normalizedName || !hasValidEmail || !normalizedMessage || normalizedMessage.length < 10) {
      this.contactInvalid = true;
      this.cdr.markForCheck();
      return;
    }

    // Optimistic UX: show immediate feedback and enqueue send; rollback on error
    this.contactSending = true;
    this.contactSent = true;
    this.snackbar.show('Invio in corso — messaggio mostrato come inviato', 'info', 3000);

    this.contactService.send({
      name: normalizedName,
      email: normalizedEmail,
      subject: 'Contatto dal portfolio',
      message: normalizedMessage,
    }).pipe(
      finalize(() => {
        this.contactSending = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: () => {
        this.contactForm = { name: '', email: '', message: '' };
        this.contactInvalid = false;
        this.cdr.markForCheck();
        this.snackbar.show('Messaggio inviato — grazie!', 'success');
      },
      error: () => {
        // rollback optimistic state
        this.contactSent = false;
        this.contactError = true;
        this.cdr.markForCheck();
        this.snackbar.show('Invio non riuscito — riprova più tardi', 'error');
      },
    });
  }

}

