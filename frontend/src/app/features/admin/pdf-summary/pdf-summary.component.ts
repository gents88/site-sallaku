import {
  Component, ChangeDetectionStrategy, OnInit, signal, computed, inject, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { SeoService } from '../../../core/services/seo.service';

interface FileSummaryResult {
  title: string;
  detectedType: string;
  shortSummary: string;
  longSummary: string;
  keywords: string[];
  keyPoints: string[];
}

type OutputMode = 'short' | 'detailed' | 'bullets' | 'insights';
type SummaryLang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt';

@Component({
  selector: 'app-pdf-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h2>🤖 AI Summarizer</h2>
          <p class="subtitle">Upload PDF, Word or TXT — AI reads it and generates a summary in seconds</p>
        </div>
        <div class="header-controls">
          <label class="ctrl-label">🌐 Language</label>
          <select class="lang-select" [(ngModel)]="selectedLang">
            <option value="it">Italiano</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="pt">Português</option>
          </select>
        </div>
      </div>

      <!-- Drop zone -->
      <div
        class="dropzone"
        [class.dragging]="isDragging()"
        [class.has-file]="!!selectedFile()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave()"
        (drop)="onDrop($event)"
        (click)="fileInput.click()">

        <input #fileInput type="file" hidden
               accept=".pdf,.doc,.docx,.txt,.html,.htm"
               (change)="onFileSelected($event)">

        @if (!selectedFile()) {
          <div class="drop-content">
            <span class="drop-icon">📂</span>
            <p class="drop-title">Drag your file here</p>
            <p class="drop-sub">or click to browse</p>
            <p class="drop-formats">PDF · Word (.docx/.doc) · TXT · HTML — max 20 MB</p>
          </div>
        } @else {
          <div class="file-selected">
            <span class="file-icon">{{ fileIcon(selectedFile()!.name) }}</span>
            <div class="file-info">
              <strong>{{ selectedFile()!.name }}</strong>
              <span class="file-size">{{ formatSize(selectedFile()!.size) }}</span>
            </div>
            <button class="remove-btn" (click)="removeFile($event)">✕</button>
          </div>
        }
      </div>

      @if (selectedFile()) {
        <div class="mode-tabs">
          @for (m of outputModes; track m.id) {
            <button class="mode-tab" [class.active]="outputMode() === m.id" (click)="outputMode.set(m.id)">
              {{ m.icon }} {{ m.label }}
            </button>
          }
        </div>
        <button class="summarize-btn" [disabled]="loading()" (click)="summarize()">
          @if (loading()) {
            <span class="spinner"></span> Analysing…
          } @else {
            🤖 Generate Summary
          }
        </button>
      }

      @if (error()) {
        <div class="error-box">⚠️ {{ error() }}</div>
      }

      @if (result()) {
        <div class="result-card">
          <div class="result-header">
            <span class="result-type-badge">{{ result()!.detectedType }}</span>
            <h3>{{ result()!.title }}</h3>
          </div>

          <div class="result-section">
            <h4>📋 Short Summary</h4>
            <p class="short-summary">{{ result()!.shortSummary }}</p>
          </div>

          <div class="result-section">
            <h4>📝 Detailed Summary</h4>
            <p class="long-summary">{{ result()!.longSummary }}</p>
          </div>

          @if (result()!.keyPoints.length) {
            <div class="result-section">
              <h4>✅ Key Points</h4>
              <ul class="key-points">
                @for (pt of result()!.keyPoints; track $index) {
                  <li>{{ pt }}</li>
                }
              </ul>
            </div>
          }

          @if (result()!.keywords.length) {
            <div class="result-section">
              <h4>🏷 Keywords</h4>
              <div class="keywords">
                @for (kw of result()!.keywords; track kw) {
                  <span class="kw-chip">{{ kw }}</span>
                }
              </div>
            </div>
          }

          <div class="result-actions">
            <button class="action-btn" (click)="copyToClipboard()" [class.copied]="justCopied()">
              {{ justCopied() ? '✅ Copied!' : '📋 Copy' }}
            </button>
            <button class="action-btn" (click)="downloadSummary()">⬇️ Download</button>
            <button class="action-btn" (click)="summarize()" [disabled]="loading()">
              🔄 Regenerate
            </button>
            <button class="action-btn danger" (click)="reset()">✕ New file</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page {
      padding: 2rem;
      max-width: 780px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 2rem;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      h2 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.25rem; }
      .subtitle { color: var(--text-secondary, #8b949e); margin: 0; font-size: 0.9rem; }
    }

    .header-controls { display: flex; align-items: center; gap: 0.5rem; }
    .ctrl-label { font-size: 0.82rem; color: var(--text-secondary, #8b949e); }
    .lang-select {
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d);
      border-radius: 7px;
      padding: 0.35rem 0.6rem;
      color: var(--text-primary, #e6edf3);
      font-size: 0.82rem;
      cursor: pointer;
      &:focus { outline: none; border-color: var(--accent, #6c63ff); }
    }

    .mode-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
    .mode-tab {
      padding: 0.4rem 0.9rem;
      border-radius: 20px;
      border: 1px solid var(--border-color, #30363d);
      background: transparent;
      color: var(--text-secondary, #8b949e);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
      &:hover { border-color: var(--accent, #6c63ff); color: var(--text-primary); }
      &.active { background: var(--accent, #6c63ff); color: #fff; border-color: var(--accent, #6c63ff); }
    }

    .result-actions {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      margin-top: 1.25rem; padding-top: 1rem;
      border-top: 1px solid var(--border-color, #30363d);
    }
    .action-btn {
      padding: 0.42rem 1rem; border-radius: 8px;
      border: 1px solid var(--border-color, #30363d);
      background: transparent; color: var(--text-secondary, #8b949e);
      font-size: 0.82rem; cursor: pointer; transition: all 0.15s;
      &:hover:not(:disabled) { border-color: var(--accent, #6c63ff); color: var(--accent, #6c63ff); }
      &.copied { border-color: #34d399; color: #34d399; }
      &.danger:hover { border-color: #f87171; color: #f87171; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .dropzone {
      border: 2px dashed var(--border-color, #30363d);
      border-radius: 14px; padding: 2.5rem 1.5rem;
      text-align: center; cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      background: var(--bg-secondary, #161b22); user-select: none;
      &.dragging { border-color: var(--accent, #6c63ff); background: rgba(108, 99, 255, 0.06); }
      &.has-file { border-style: solid; border-color: var(--accent, #6c63ff); padding: 1.25rem 1.5rem; }
    }

    .drop-content { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
    .drop-icon { font-size: 2.8rem; }
    .drop-title { font-size: 1.05rem; font-weight: 600; color: var(--text-primary, #e6edf3); margin: 0; }
    .drop-sub { font-size: 0.85rem; color: var(--text-secondary, #8b949e); margin: 0; }
    .drop-formats { font-size: 0.78rem; color: var(--text-muted, #6e7681); margin: 0.5rem 0 0; }

    .file-selected { display: flex; align-items: center; gap: 0.75rem; }
    .file-icon { font-size: 2rem; flex-shrink: 0; }
    .file-info {
      flex: 1; text-align: left;
      strong { display: block; font-size: 0.9rem; color: var(--text-primary, #e6edf3); word-break: break-all; }
      .file-size { font-size: 0.78rem; color: var(--text-secondary, #8b949e); }
    }
    .remove-btn {
      background: none; border: none; color: var(--text-secondary, #8b949e);
      cursor: pointer; font-size: 1rem; padding: 0.25rem 0.5rem; border-radius: 6px;
      &:hover { color: #f85149; background: rgba(248, 81, 73, 0.1); }
    }

    .summarize-btn {
      display: flex; align-items: center; gap: 0.6rem;
      margin-top: 1rem; padding: 0.65rem 1.6rem;
      background: var(--accent, #6c63ff); color: white;
      border: none; border-radius: 9px; font-size: 0.95rem; font-weight: 600;
      cursor: pointer; transition: opacity 0.15s;
      &:hover:not(:disabled) { opacity: 0.85; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
      border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-box {
      margin-top: 1rem;
      background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3);
      color: #f85149; border-radius: 9px; padding: 0.75rem 1rem; font-size: 0.875rem;
    }

    .result-card {
      margin-top: 1.5rem;
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; padding: 1.5rem;
    }

    .result-header {
      display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;
      h3 { font-size: 1.05rem; font-weight: 700; margin: 0; color: var(--text-primary, #e6edf3); }
    }

    .result-type-badge {
      background: rgba(108, 99, 255, 0.15); color: var(--accent, #6c63ff);
      border: 1px solid rgba(108, 99, 255, 0.3); border-radius: 6px;
      padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight: 600; white-space: nowrap;
    }

    .result-section {
      border-top: 1px solid var(--border-color, #30363d); padding: 1rem 0;
      h4 { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary, #8b949e); margin: 0 0 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
      p { margin: 0; font-size: 0.9rem; color: var(--text-primary, #e6edf3); line-height: 1.65; }
      .short-summary { font-size: 1rem; font-weight: 500; border-left: 3px solid var(--accent, #6c63ff); padding-left: 0.75rem; }
      .long-summary { white-space: pre-line; }
    }

    .key-points {
      margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.5rem;
      li {
        display: flex; gap: 0.6rem; align-items: flex-start;
        font-size: 0.875rem; color: var(--text-primary, #e6edf3); line-height: 1.5;
        &::before { content: '▸'; color: var(--accent, #6c63ff); flex-shrink: 0; font-size: 0.8rem; margin-top: 2px; }
      }
    }

    .keywords { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .kw-chip {
      background: rgba(108, 99, 255, 0.1); color: var(--accent, #6c63ff);
      border: 1px solid rgba(108, 99, 255, 0.25); border-radius: 20px;
      padding: 0.2rem 0.65rem; font-size: 0.78rem;
    }
  `],
})
export class PdfSummaryComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private http       = inject(HttpClient);
  private readonly seo = inject(SeoService);
  private readonly api = `${environment.apiUrl}/ai/summarize-file`;

  ngOnInit(): void {
    this.seo.update({
      title: 'AI PDF Summarizer — Extract Key Points from Any Document',
      description: 'Upload any PDF, Word or TXT file and get an AI-powered summary instantly. Short summary, detailed analysis, bullet points or key insights. Free AI document summarizer online.',
      url: 'https://gentsallaku.it/dashboard/pdf-summary',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'AI PDF Summarizer',
      description: 'Upload any PDF, Word or TXT file and get an AI-powered summary, key points and insights instantly.',
      url: 'https://gentsallaku.it/dashboard/pdf-summary',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Short summary', 'Detailed analysis', 'Bullet points', 'Key insights', 'Multiple languages', '20 MB limit'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  selectedFile   = signal<File | null>(null);
  isDragging     = signal(false);
  loading        = signal(false);
  result         = signal<FileSummaryResult | null>(null);
  error          = signal<string | null>(null);
  justCopied     = signal(false);

  selectedLang: SummaryLang = 'en';
  outputMode     = signal<OutputMode>('short');

  readonly outputModes: { id: OutputMode; icon: string; label: string }[] = [
    { id: 'short',    icon: '⚡', label: 'Brief' },
    { id: 'detailed', icon: '📄', label: 'Detailed' },
    { id: 'bullets',  icon: '•',  label: 'Key Points' },
    { id: 'insights', icon: '💡', label: 'Insights' },
  ];

  readonly displayedSummary = computed(() => {
    const r = this.result();
    if (!r) return '';
    switch (this.outputMode()) {
      case 'short':    return r.shortSummary;
      case 'detailed': return r.longSummary;
      case 'bullets':  return r.keyPoints?.join('\n') ?? r.shortSummary;
      case 'insights': return r.keywords?.join(', ') ?? r.shortSummary;
      default:         return r.shortSummary;
    }
  });

  onDragOver(event: DragEvent): void { event.preventDefault(); this.isDragging.set(true); }
  onDragLeave(): void { this.isDragging.set(false); }
  onDrop(event: DragEvent): void {
    event.preventDefault(); this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setFile(file);
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setFile(file);
    input.value = '';
  }
  removeFile(event: MouseEvent): void {
    event.stopPropagation();
    this.selectedFile.set(null); this.result.set(null); this.error.set(null);
  }

  copyToClipboard(): void {
    const text = this.displayedSummary() || '';
    navigator.clipboard.writeText(text).then(() => {
      this.justCopied.set(true);
      setTimeout(() => this.justCopied.set(false), 2000);
    });
  }

  downloadSummary(): void {
    const r = this.result();
    if (!r) return;
    const content = [
      `# ${r.title}`,
      `Type: ${r.detectedType}`,
      '',
      '## Short Summary',
      r.shortSummary,
      '',
      '## Detailed Summary',
      r.longSummary,
      '',
      '## Key Points',
      ...(r.keyPoints ?? []).map(p => `- ${p}`),
      '',
      '## Keywords',
      r.keywords?.join(', ') ?? '',
    ].join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([content], { type: 'text/markdown' })),
      download: `${r.title ?? 'summary'}.md`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  summarize(): void {
    const file = this.selectedFile();
    if (!file) return;
    this.loading.set(true); this.error.set(null); this.result.set(null);
    const form = new FormData();
    form.append('file', file);
    form.append('lang', this.selectedLang);
    form.append('mode', this.outputMode());
    this.http.post<FileSummaryResult>(this.api, form).subscribe({
      next: (res) => { this.result.set(res); this.loading.set(false); },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? 'Error during file analysis.';
        this.error.set(msg); this.loading.set(false);
      },
    });
  }

  reset(): void { this.selectedFile.set(null); this.result.set(null); this.error.set(null); }

  private setFile(file: File): void {
    this.result.set(null); this.error.set(null); this.selectedFile.set(file);
  }

  fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const icons: Record<string, string> = {
      pdf: '📕', doc: '📘', docx: '📘', txt: '📄', html: '🌐', htm: '🌐', json: '📦',
    };
    return icons[ext] ?? '📎';
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
