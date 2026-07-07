import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';

interface ToolCard {
  icon: string;
  titleKey: string;
  descKey: string;
  route: string;
  group: 'ai' | 'tools';
  badge?: string;
}

@Component({
  selector: 'app-tools',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="header-badge">
          <span class="badge-dot"></span>
          {{ 'tools.badge' | translate }}
        </div>
        <h1>{{ 'tools.heading' | translate }}</h1>
        <p>{{ 'tools.subtitle' | translate }}</p>
      </header>

      <section class="tools-section">
        <h2 class="section-title">
          <span class="section-emoji">🧠</span> {{ 'tools.section_ai' | translate }}
        </h2>
        <div class="cards-grid">
          @for (card of aiCards; track card.route) {
            <a [routerLink]="card.route" class="tool-card">
              <div class="card-icon">{{ card.icon }}</div>
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
          @for (card of toolCards; track card.route) {
            <a [routerLink]="card.route" class="tool-card tool-card--secondary">
              <div class="card-icon">{{ card.icon }}</div>
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

    .page { padding: 3rem 2rem; max-width: 1100px; margin: 0 auto; }

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
      font-size: 1.8rem; flex-shrink: 0;
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(108,99,255,.1); border-radius: 10px;
    }

    .tool-card--secondary .card-icon {
      background: rgba(99,179,255,.08);
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

  ngOnInit(): void {
    this.seo.update({
      title: 'Free AI PDF Tools & Document Utilities',
      description: 'Free AI-powered online tools: PDF translator, AI presentation generator, text formatter and PDF summarizer. Professional document tools powered by GPT-4o. No signup required.',
      url: 'https://gentsallaku.it/dashboard/tools',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'AI & PDF Tools',
      description: 'Free AI-powered document tools: PDF translator, AI slides generator, text formatter, PDF summarizer.',
      url: 'https://gentsallaku.it/dashboard/tools',
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      hasPart: [
        { '@type': 'WebApplication', name: 'AI PDF Translator', url: 'https://gentsallaku.it/dashboard/pdf-translate', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'AI Slides Generator', url: 'https://gentsallaku.it/dashboard/ai-ppt', applicationCategory: 'PresentationApplication' },
        { '@type': 'WebApplication', name: 'AI Document Formatter', url: 'https://gentsallaku.it/dashboard/ai-formatter', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'AI PDF Summarizer', url: 'https://gentsallaku.it/dashboard/pdf-summary', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'File Converter', url: 'https://gentsallaku.it/dashboard/convert', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'PDF Editor', url: 'https://gentsallaku.it/dashboard/pdf-editor', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'PDF Viewer', url: 'https://gentsallaku.it/dashboard/viewer', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'Document Editor', url: 'https://gentsallaku.it/dashboard/editor', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'OCR — Text Recognition', url: 'https://gentsallaku.it/dashboard/ocr', applicationCategory: 'UtilitiesApplication' },
        { '@type': 'WebApplication', name: 'Document Scanner', url: 'https://gentsallaku.it/dashboard/scanner', applicationCategory: 'UtilitiesApplication' },
      ],
    });
  }

  readonly aiCards: ToolCard[] = [
    { icon: '📋', titleKey: 'tools.pdf_summary_title',  descKey: 'tools.pdf_summary_desc',  route: '/dashboard/pdf-summary',   group: 'ai' },
    { icon: '✨', titleKey: 'tools.ai_formatter_title', descKey: 'tools.ai_formatter_desc', route: '/dashboard/ai-formatter',  group: 'ai' },
    { icon: '🌐', titleKey: 'tools.pdf_translate_title',descKey: 'tools.pdf_translate_desc',route: '/dashboard/pdf-translate', group: 'ai' },
    { icon: '🎞️', titleKey: 'tools.ai_slides_title',   descKey: 'tools.ai_slides_desc',    route: '/dashboard/ai-ppt',        group: 'ai' },
  ];

  readonly toolCards: ToolCard[] = [
    { icon: '🖊️', titleKey: 'tools.pdf_editor_title', descKey: 'tools.pdf_editor_desc', route: '/dashboard/pdf-editor', group: 'tools' },
    { icon: '👁',  titleKey: 'tools.viewer_title',     descKey: 'tools.viewer_desc',     route: '/dashboard/viewer',     group: 'tools' },
    { icon: '✏️', titleKey: 'tools.editor_title',      descKey: 'tools.editor_desc',     route: '/dashboard/editor',     group: 'tools' },
    { icon: '🔄', titleKey: 'tools.convert_title',     descKey: 'tools.convert_desc',    route: '/dashboard/convert',    group: 'tools' },
    { icon: '🔤', titleKey: 'tools.ocr_title',         descKey: 'tools.ocr_desc',        route: '/dashboard/ocr',        group: 'tools' },
    { icon: '📷', titleKey: 'tools.scanner_title',     descKey: 'tools.scanner_desc',    route: '/dashboard/scanner',    group: 'tools' },
  ];
}
