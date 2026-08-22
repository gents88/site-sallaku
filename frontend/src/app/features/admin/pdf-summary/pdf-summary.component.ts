import {
  Component, ChangeDetectionStrategy, OnInit, signal, computed, inject, ElementRef, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { environment } from '@env/environment';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';

interface FileSummaryResult {
  title: string;
  detectedType: string;
  shortSummary: string;
  longSummary: string;
  keywords: string[];
  keyPoints: string[];
  /** true solo su documenti eccezionalmente lunghi, oltre il tetto di sicurezza a blocchi del backend. */
  truncated: boolean;
}

type OutputMode = 'short' | 'detailed' | 'bullets' | 'insights';
type SummaryLang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'pt';

/** Allineato al limite lato backend (validateFile(file, 20) in ai.controller.ts). */
const MAX_FILE_MB = 20;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'html', 'htm'];

@Component({
  selector: 'app-pdf-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, FileDropzoneDirective],
  templateUrl: './pdf-summary.component.html',
  styleUrls: ['./pdf-summary.component.scss'],
})
export class PdfSummaryComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private http       = inject(HttpClient);
  private readonly seo = inject(SeoService);
  private readonly workspace = inject(WorkspaceService);
  private readonly t = inject(TranslateService);
  private readonly api = `${environment.apiUrl}/ai/summarize-file`;

  workspaceItem = signal<WorkspaceItem | null>(null);

  ngOnInit(): void {
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file') {
      this.workspaceItem.set(pending);
    }
    this.seo.update({
      title: 'AI PDF Summarizer — Extract Key Points from Any Document',
      description: 'Upload any PDF, Word or TXT file and get an AI-powered summary instantly. Short summary, detailed analysis, bullet points or key insights. Free AI document summarizer online.',
      url: 'https://gentsallaku.it/lab/pdf-summary',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'AI PDF Summarizer',
        description: 'Upload any PDF, Word or TXT file and get an AI-powered summary, key points and insights instantly.',
        url: 'https://gentsallaku.it/lab/pdf-summary',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['Short summary', 'Detailed analysis', 'Bullet points', 'Key insights', 'Multiple languages', '20 MB limit'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What file types can I summarize?',
            acceptedAnswer: { '@type': 'Answer', text: 'PDF, Word (.docx) and plain text (.txt) files, up to 20 MB.' },
          },
          {
            '@type': 'Question',
            name: 'What kind of summary do I get?',
            acceptedAnswer: { '@type': 'Answer', text: 'Choose between a short summary, a detailed analysis, or a bullet-point list of key insights.' },
          },
          {
            '@type': 'Question',
            name: 'Does it support multiple languages?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, summaries can be generated in multiple languages.' },
          },
        ],
      },
    ]);
  }

  selectedFile   = signal<File | null>(null);
  loading        = signal(false);
  result         = signal<FileSummaryResult | null>(null);
  error          = signal<string | null>(null);
  justCopied     = signal(false);
  justSent       = signal(false);

  selectedLang: SummaryLang = 'en';
  outputMode     = signal<OutputMode>('short');

  readonly outputModes: { id: OutputMode; icon: string; labelKey: string }[] = [
    { id: 'short',    icon: '⚡', labelKey: 'pdf_summary.mode_short' },
    { id: 'detailed', icon: '📄', labelKey: 'pdf_summary.mode_detailed' },
    { id: 'bullets',  icon: '•',  labelKey: 'pdf_summary.mode_bullets' },
    { id: 'insights', icon: '💡', labelKey: 'pdf_summary.mode_insights' },
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

  onFilesDropped(files: FileList): void {
    const file = files[0];
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

  useWorkspaceFile(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'file' || !item.blob) return;
    const file = new File([item.blob], item.filename, { type: item.mime });
    this.setFile(file);
  }

  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  sendToWorkspace(): void {
    const r = this.result();
    if (!r) return;
    this.workspace.send({
      kind: 'text',
      text: this.displayedSummary(),
      filename: `${r.title || 'summary'}.txt`,
      fromTool: 'pdf_summary',
    });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
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
        const msg = err?.error?.message ?? err?.message ?? this.t.instant('pdf_summary.err_generic');
        this.error.set(msg); this.loading.set(false);
      },
    });
  }

  reset(): void { this.selectedFile.set(null); this.result.set(null); this.error.set(null); }

  private setFile(file: File): void {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      this.error.set(this.t.instant('pdf_summary.err_file_type'));
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      this.error.set(this.t.instant('pdf_summary.err_file_too_large', { max: MAX_FILE_MB, name: file.name }));
      return;
    }
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
