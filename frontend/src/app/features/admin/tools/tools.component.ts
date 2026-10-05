import { Component, ChangeDetectionStrategy, ElementRef, HostListener, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { sidebarGroups } from '../../../core/navigation/nav-registry';
import { NavIconComponent, navIconColor } from '../../../shared/components/nav-icon/nav-icon.component';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { LabActivityService } from '../../../core/services/lab-activity.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { labToolEntry, labToolsAccepting, workspaceInput } from '../../../core/navigation/lab-tools';
import { NavEntry } from '../../../core/navigation/nav-registry';

interface ToolCard {
  id: string;
  icon: string;
  titleKey: string;
  descKey: string;
  route: string;
  badge?: string;
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** Card del Lab dal registro unico: stesse voci (e stesso ordine) della sidebar. */
function cardsFor(group: 'ai' | 'tools'): ToolCard[] {
  return sidebarGroups(false)
    .find(g => g.id === group)!
    .items.map(e => ({ id: e.id, icon: e.icon, titleKey: e.searchTitleKey ?? e.labelKey, descKey: e.descKey ?? '', route: e.route }));
}

@Component({
  selector: 'app-tools',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule, BreadcrumbComponent, NavIconComponent, LangUrlPipe],
  template: `
    <div class="page">
      <app-breadcrumb [items]="breadcrumbItems"></app-breadcrumb>
      <header class="page-header">
        <div class="header-badge">
          <span class="badge-dot"></span>
          {{ 'tools.badge' | translate }}
        </div>
        <h1>{{ 'tools.heading' | translate }}</h1>
        <p>{{ 'tools.subtitle' | translate }}</p>
      </header>

      <!-- Trascina un file (o sceglilo): finisce nel workspace e il riquadro qui sotto propone gli strumenti adatti. -->
      <div class="drop-card">
        <span class="drop-card__icon" aria-hidden="true">📄</span>
        <p>{{ 'lab_drop.hint' | translate }}</p>
        <label class="drop-card__pick">
          {{ 'lab_drop.pick' | translate }}
          <input type="file" class="visually-hidden-input" (change)="onPick($event)" />
        </label>
      </div>

      @if (dragging()) {
        <div class="drop-overlay" aria-hidden="true">
          <div class="drop-overlay__box">
            <span class="drop-card__icon">📥</span>
            {{ 'lab_drop.release' | translate }}
          </div>
        </div>
      }

      @if (pending() || recentTools().length) {
        <section class="tools-section resume" aria-labelledby="resume-title">
          <h2 id="resume-title" class="section-title">
            <span class="section-emoji" aria-hidden="true">⏱️</span> {{ 'lab_next.resume_title' | translate }}
          </h2>
          @if (pending(); as p) {
            <div class="resume-pending" tabindex="-1">
              <p>
                {{ 'lab_next.pending' | translate: { name: p.filename } }}
                @if (ignoredFiles()) {
                  <small class="resume-note">{{ 'lab_drop.only_first' | translate: { count: ignoredFiles() } }}</small>
                }
              </p>
              <div class="resume-chips">
                @for (step of pendingSteps(); track step.id) {
                  <a [routerLink]="step.route | langUrl" class="resume-chip">
                    <span class="icon-tile" aria-hidden="true" [style.--icon-color]="iconColor(step.icon)"><app-nav-icon [name]="step.icon" [size]="14" /></span>
                    {{ (step.searchTitleKey ?? step.labelKey) | translate }}
                  </a>
                }
              </div>
            </div>
          }
          @if (recentTools().length) {
            <div class="cards-grid">
              @for (tool of recentTools(); track tool.id) {
                <a [routerLink]="tool.route | langUrl" class="tool-card tool-card--recent icon-tile--lift">
                  <div class="card-icon icon-tile" aria-hidden="true" [style.--icon-color]="iconColor(tool.icon)"><app-nav-icon [name]="tool.icon" [size]="22" /></div>
                  <div class="card-body">
                    <h3>{{ (tool.searchTitleKey ?? tool.labelKey) | translate }}</h3>
                  </div>
                  <span class="card-arrow">→</span>
                </a>
              }
            </div>
          }
        </section>
      }

      <a [routerLink]="'/lab/workspace' | langUrl" class="workspace-banner">
        <div class="workspace-banner-icon">🔗</div>
        <div class="workspace-banner-body">
          <h2>{{ 'workspace.title' | translate }}</h2>
          <p>{{ 'workspace.subtitle' | translate }}</p>
        </div>
        <span class="card-arrow">→</span>
      </a>

      <section class="tools-section">
        <h2 class="section-title">
          <span class="section-emoji">🧠</span> {{ 'tools.section_ai' | translate }}
        </h2>
        <div class="cards-grid">
          @for (card of aiCards; track card.id) {
            <a [routerLink]="card.route | langUrl" class="tool-card icon-tile--lift">
              <div class="card-icon icon-tile" aria-hidden="true" [style.--icon-color]="iconColor(card.icon)"><app-nav-icon [name]="card.icon" [size]="22" /></div>
              <div class="card-body">
                <h3>{{ card.titleKey | translate }}</h3>
                <p>{{ card.descKey | translate }}</p>
              </div>
              @if (card.badge) {
                <span class="card-badge">{{ card.badge }}</span>
              }
              <span class="card-arrow">→</span>
            </a>
          }
        </div>
      </section>

      <section class="tools-section">
        <h2 class="section-title">
          <span class="section-emoji">🧰</span> {{ 'tools.section_tools' | translate }}
        </h2>
        <div class="cards-grid">
          @for (card of toolCards; track card.id) {
            <a [routerLink]="card.route | langUrl" class="tool-card tool-card--secondary icon-tile--lift">
              <div class="card-icon icon-tile" aria-hidden="true" [style.--icon-color]="iconColor(card.icon)"><app-nav-icon [name]="card.icon" [size]="22" /></div>
              <div class="card-body">
                <h3>{{ card.titleKey | translate }}</h3>
                <p>{{ card.descKey | translate }}</p>
              </div>
              @if (card.badge) {
                <span class="card-badge card-badge--soon">{{ card.badge }}</span>
              }
              <span class="card-arrow">→</span>
            </a>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--bg-primary, #0d1117); }

    .page { padding: 2rem; max-width: 1100px; margin: 0 auto; }

    /* ─── Header ─── */
    .page-header {
      text-align: center;
      margin-bottom: 3.5rem;
    }

    .header-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 16px; border-radius: 100px;
      background: rgba(108,99,255,.1); border: 1px solid rgba(108,99,255,.28);
      font-size: 12px; color: #a78bfa; margin-bottom: 1.25rem; letter-spacing: .03em;
    }
    /* #a78bfa su sfondo chiaro era 2.3:1 (axe): tonalità più scura in light. */
    :host-context([data-theme='light']) .header-badge { color: #6d28d9; }
    .badge-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #7c3aed; box-shadow: 0 0 6px #7c3aed;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity:1; box-shadow:0 0 6px #7c3aed } 50% { opacity:.5; box-shadow:0 0 2px #7c3aed } }

    h1 {
      font-size: clamp(1.8rem, 4vw, 2.75rem); font-weight: 800;
      margin: 0 0 .75rem; color: var(--text-primary, #e6edf3);
      background: linear-gradient(130deg, #e6edf3 30%, #a78bfa 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }

    .page-header p {
      font-size: 1.05rem; color: var(--text-secondary, #8b949e);
      line-height: 1.7; margin: 0;
    }

    /* ─── Workspace banner ─── */
    .workspace-banner {
      display: flex; align-items: center; gap: 1.25rem;
      padding: 1.5rem 1.75rem; margin-bottom: 3rem;
      background: linear-gradient(120deg, rgba(108,99,255,.12), rgba(99,179,255,.06));
      border: 1px solid rgba(108,99,255,.35);
      border-radius: 16px; text-decoration: none;
      transition: border-color .2s, transform .2s;

      &:hover {
        border-color: rgba(108,99,255,.6);
        transform: translateY(-2px);
        .card-arrow { opacity: 1; transform: translateX(3px); }
      }
    }
    .workspace-banner-icon {
      font-size: 2rem; flex-shrink: 0;
      width: 56px; height: 56px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(108,99,255,.15); border-radius: 12px;
    }
    .workspace-banner-body {
      flex: 1; min-width: 0;
      h2 { font-size: 1.1rem; font-weight: 800; margin: 0 0 .3rem; color: var(--text-primary, #e6edf3); background: none; -webkit-text-fill-color: initial; }
      p { font-size: .85rem; color: var(--text-secondary, #8b949e); margin: 0; line-height: 1.5; }
    }

    /* ─── Continua da dove eri rimasto ─── */
    .resume-pending {
      display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1rem;
      padding: .9rem 1.1rem; margin-bottom: 1rem;
      border: 1px dashed rgba(108,99,255,.45); border-radius: 14px;
      background: rgba(108,99,255,.06);
      p { margin: 0; font-size: .9rem; color: var(--text-primary, #e6edf3); }
    }
    .resume-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
    .resume-chip {
      display: inline-flex; align-items: center; gap: .35rem;
      padding: .3rem .65rem .3rem .35rem; border-radius: 999px;
      border: 1px solid var(--border-color, #30363d);
      color: var(--text-primary, #e6edf3); font-size: .8rem; text-decoration: none;
      &:hover, &:focus-visible { border-color: rgba(108,99,255,.6); }
    }
    .tool-card--recent { padding: .8rem 1rem; }
    .resume-note { display: block; margin-top: .25rem; color: var(--text-secondary, #8b949e); }

    /* ─── Drag & drop ─── */
    .drop-card {
      display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1rem;
      padding: 1rem 1.25rem; margin-bottom: 2rem;
      border: 1.5px dashed var(--border-color, #30363d); border-radius: 14px;
      p { flex: 1; min-width: 200px; margin: 0; font-size: .9rem; color: var(--text-secondary, #8b949e); }
    }
    .drop-card__icon { font-size: 1.5rem; }
    .drop-card__pick {
      position: relative; cursor: pointer;
      padding: .45rem .9rem; border-radius: 10px;
      border: 1px solid rgba(108,99,255,.45); color: var(--text-primary, #e6edf3);
      font-size: .85rem; font-weight: 600;
      &:hover { border-color: rgba(108,99,255,.8); }
      &:focus-within { outline: 2px solid #7c3aed; outline-offset: 2px; }
    }
    .visually-hidden-input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
    .drop-overlay {
      position: fixed; inset: 0; z-index: 1200;
      display: flex; align-items: center; justify-content: center;
      background: rgba(13,17,23,.72); backdrop-filter: blur(2px);
      pointer-events: none;
    }
    .drop-overlay__box {
      display: flex; flex-direction: column; align-items: center; gap: .5rem;
      padding: 2rem 2.5rem; border-radius: 18px;
      border: 2px dashed #a78bfa; background: var(--bg-secondary, #161b22);
      color: var(--text-primary, #e6edf3); font-weight: 700;
      .drop-card__icon { font-size: 2.5rem; }
    }

    /* ─── Section ─── */
    .tools-section { margin-bottom: 3rem; }

    .section-title {
      display: flex; align-items: center; gap: .5rem;
      font-size: 1.1rem; font-weight: 700; color: var(--text-primary, #e6edf3);
      margin: 0 0 1.25rem; padding-bottom: .75rem;
      border-bottom: 1px solid var(--border-color, #30363d);
    }
    .section-emoji { font-size: 1.2rem; }

    /* ─── Cards grid ─── */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem;
    }

    .tool-card {
      display: flex; align-items: center; gap: 1rem;
      padding: 1.1rem 1.25rem;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; text-decoration: none;
      transition: border-color .2s, transform .2s, background .2s;
      position: relative; overflow: hidden;
      cursor: pointer;

      &:hover {
        border-color: rgba(108,99,255,.55);
        background: rgba(108,99,255,.05);
        transform: translateY(-2px);
        .card-arrow { opacity: 1; transform: translateX(3px); }
      }
    }

    .tool-card--secondary:hover {
      border-color: rgba(99,179,255,.45);
      background: rgba(99,179,255,.04);
    }

    .card-icon {
      flex-shrink: 0;
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      /* Aspetto 3D (gradiente, luce, ombra): .icon-tile in styles.scss. */
      border-radius: 12px;
    }

    .card-body {
      flex: 1; min-width: 0;
      h3 { font-size: .9rem; font-weight: 700; margin: 0 0 .25rem; color: var(--text-primary, #e6edf3); }
      p  { font-size: .76rem; color: var(--text-secondary, #8b949e); margin: 0; line-height: 1.45; }
    }

    .card-badge {
      position: absolute; top: .6rem; right: 2rem;
      font-size: .62rem; font-weight: 700; padding: .2rem .55rem;
      border-radius: 100px; background: rgba(108,99,255,.18);
      color: #a78bfa; border: 1px solid rgba(108,99,255,.3);
      letter-spacing: .04em; white-space: nowrap;
    }

    .card-badge--soon {
      background: rgba(99,179,255,.1); color: #93c5fd;
      border-color: rgba(99,179,255,.25);
    }

    .card-arrow {
      color: var(--text-muted, #6e7681); font-size: 1rem; flex-shrink: 0;
      opacity: 0; transition: opacity .2s, transform .2s;
    }

    @media (max-width: 640px) {
      .page { padding: 2rem 1rem; }
      .cards-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class ToolsComponent implements OnInit {
  private readonly seo = inject(SeoService);
  private readonly langService = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  breadcrumbItems: BreadcrumbItem[] = [];

  ngOnInit(): void {
    this.seo.update({
      title: this.translate.instant('tools.seo_title'),
      description: this.translate.instant('tools.seo_description'),
      url: `${SITE_ORIGIN}${withLangPrefix('/lab', this.langService.current())}`,
    });
    this.breadcrumbItems = [
      { label: this.translate.instant('nav.home'), path: '/' },
      { label: this.translate.instant('sidebar.lab') },
    ];
    this.seo.injectJsonLd([{
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'AI & PDF Tools',
      description: 'Free AI-powered document tools: PDF translator, AI slides generator, text formatter, PDF summarizer.',
      url: 'https://gentsallaku.it/lab',
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      hasPart: [
        { '@type': 'WebApplication', name: 'AI PDF Translator', url: 'https://gentsallaku.it/lab/pdf-translate', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'AI Slides Generator', url: 'https://gentsallaku.it/lab/ai-ppt', applicationCategory: 'PresentationApplication' },
        { '@type': 'WebApplication', name: 'AI Document Formatter', url: 'https://gentsallaku.it/lab/ai-formatter', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'AI PDF Summarizer', url: 'https://gentsallaku.it/lab/pdf-summary', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'File Converter', url: 'https://gentsallaku.it/lab/convert', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'PDF Editor', url: 'https://gentsallaku.it/lab/pdf-editor', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'PDF Viewer', url: 'https://gentsallaku.it/lab/viewer', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'Document Editor', url: 'https://gentsallaku.it/lab/editor', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'OCR — Text Recognition', url: 'https://gentsallaku.it/lab/ocr', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'Document Scanner', url: 'https://gentsallaku.it/lab/scanner', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'PDF Search', url: 'https://gentsallaku.it/lab/pdf-search', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'My PDF Library', url: 'https://gentsallaku.it/lab/library', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'Workflow', url: 'https://gentsallaku.it/lab/workspace', applicationCategory: 'UtilitiesApplication' },
      ],
    },
    this.seo.breadcrumb([
      { name: this.translate.instant('nav.home'), url: 'https://gentsallaku.it/' },
      { name: this.translate.instant('sidebar.lab'), url: 'https://gentsallaku.it/lab' },
    ]),
    ]);
  }

  readonly iconColor = navIconColor;
  private readonly labActivity = inject(LabActivityService);
  private readonly workspace = inject(WorkspaceService);

  /** Strumenti aperti di recente su questo dispositivo (localStorage). */
  readonly recentTools = computed(() =>
    this.labActivity.recent()
      .map(t => labToolEntry(t.id))
      .filter((e): e is NavEntry => !!e),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Un file viene trascinato sopra la pagina. */
  readonly dragging = signal(false);
  /** File oltre il primo nell'ultimo rilascio (si usa solo il primo). */
  readonly ignoredFiles = signal(0);
  private dragDepth = 0;

  // Ascoltati su document finché la pagina /lab è aperta: si può rilasciare
  // ovunque, non solo su un riquadro. Il contatore evita lo sfarfallio dei
  // dragleave che scattano passando sopra gli elementi figli.
  @HostListener('document:dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (!hasFiles(event)) return;
    this.dragDepth++;
    this.dragging.set(true);
  }

  @HostListener('document:dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (hasFiles(event)) event.preventDefault(); // senza, il browser aprirebbe il file al posto della pagina
  }

  @HostListener('document:dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (!hasFiles(event)) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  @HostListener('document:drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!hasFiles(event)) return;
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    this.useFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.useFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  /** Mette il (primo) file nel workspace e porta l'attenzione sui suggerimenti. */
  useFiles(files: File[]): void {
    const [file] = files;
    if (!file) return;
    this.workspace.send({ kind: 'file', blob: file, filename: file.name, mime: file.type || undefined, fromTool: 'lab' });
    this.ignoredFiles.set(files.length - 1);
    afterNextRender(() => {
      const box = this.host.nativeElement.querySelector<HTMLElement>('.resume-pending');
      box?.focus({ preventScroll: true });
      box?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, { injector: this.injector });
  }

  /** Risultato in attesa nel workspace (solo in memoria, sparisce al reload). */
  readonly pending = this.workspace.current;
  readonly pendingSteps = computed(() => {
    const item = this.pending();
    return item ? labToolsAccepting(workspaceInput(item), item.fromTool) : [];
  });

  readonly aiCards = cardsFor('ai');
  readonly toolCards = cardsFor('tools');
}
