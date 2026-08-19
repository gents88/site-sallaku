import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { SeoService } from '../../../core/services/seo.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import {
  PdfTranslateService,
  TranslationLanguage,
  TranslatePdfResult,
  TRANSLATION_LANGUAGES,
  TranslateOptions,
} from '../../../core/services/pdf-translate.service';

type TranslationMode = 'high_fidelity' | 'standard';

@Component({
  selector: 'app-pdf-translate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, FileDropzoneDirective, LangUrlPipe],
  templateUrl: './pdf-translate.component.html',
  styleUrls: ['./pdf-translate.component.scss'],
})
export class PdfTranslateComponent implements OnInit, OnDestroy {
  @ViewChild('uploadSection') uploadSection!: ElementRef<HTMLElement>;
  @ViewChild('fileInput')     fileInput!: ElementRef<HTMLInputElement>;

  private readonly service   = inject(PdfTranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo       = inject(SeoService);
  private readonly workspace = inject(WorkspaceService);

  readonly workspaceItem = signal<WorkspaceItem | null>(null);
  readonly justSent      = signal(false);

  ngOnInit(): void {
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file') {
      this.workspaceItem.set(pending);
    }
    this.seo.update({
      title: 'AI PDF Translator — Translate PDF with Layout Preserved',
      description: 'Translate any PDF to 12 languages while keeping fonts, images and layout intact. Enterprise-grade AI translation powered by GPT-4o. Free online PDF translator — no signup needed.',
      url: 'https://gentsallaku.it/lab/pdf-translate',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'AI PDF Translator',
        description: 'Translate any PDF to 12 languages while preserving the original layout, fonts and images. Powered by GPT-4o.',
        url: 'https://gentsallaku.it/lab/pdf-translate',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['12 languages', 'Layout preserved', 'OCR for scanned PDFs', 'GPT-4o quality', '50 MB limit'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How many languages can I translate a PDF into?',
            acceptedAnswer: { '@type': 'Answer', text: 'You can translate PDFs into 12 languages, powered by GPT-4o for high-quality, natural translations.' },
          },
          {
            '@type': 'Question',
            name: 'Will the translated PDF keep the original layout?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes — High Fidelity mode preserves columns, fonts, images, headers, footers and exact block positions. A faster Standard mode is also available for clean text output.' },
          },
          {
            '@type': 'Question',
            name: 'Can it translate scanned PDFs?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, scanned (image-based) PDFs are automatically detected and processed through an OCR pipeline before translation.' },
          },
          {
            '@type': 'Question',
            name: "What's the maximum file size?",
            acceptedAnswer: { '@type': 'Answer', text: 'Up to 50 MB per PDF.' },
          },
        ],
      },
    ]);
  }

  readonly loading = this.service.isLoading;

  readonly file             = signal<File | null>(null);
  readonly result           = signal<TranslatePdfResult | null>(null);
  readonly error            = signal('');
  readonly selectedLanguage = signal<TranslationLanguage>('english');
  readonly copied           = signal(false);
  readonly mode             = signal<TranslationMode>('high_fidelity');

  // Staged status indicator shown while `loading` is true. The backend call is a
  // single synchronous POST with no progress channel, so this is an honest
  // client-side heuristic (time-based step advance) — not real fractional progress.
  readonly translateStepKeys: string[] = [
    'pdf_translate.step_extracting',
    'pdf_translate.step_translating',
    'pdf_translate.step_rebuilding',
  ];
  readonly currentStepIndex = signal(0);
  readonly currentStepKey   = computed(() => this.translateStepKeys[this.currentStepIndex()] ?? this.translateStepKeys[0]);

  private _stepTimer: ReturnType<typeof setInterval> | null = null;

  private _startStepCycle(fileSizeBytes: number): void {
    this._stopStepCycle();
    this.currentStepIndex.set(0);
    const totalSteps = this.translateStepKeys.length;
    if (totalSteps <= 1) return;
    // Rough heuristic: bigger files get more time per step. Not tied to real progress.
    const mb = fileSizeBytes / (1024 * 1024);
    const perStepMs = Math.min(9000, Math.max(2200, mb * 900));
    this._stepTimer = setInterval(() => {
      const next = this.currentStepIndex() + 1;
      if (next >= totalSteps) { this._stopStepCycle(); return; }
      this.currentStepIndex.set(next);
    }, perStepMs);
  }

  private _stopStepCycle(): void {
    if (this._stepTimer) { clearInterval(this._stepTimer); this._stepTimer = null; }
  }

  private _originalBlobUrl:   string | null = null;
  private _translatedBlobUrl: string | null = null;

  readonly originalPdfUrl   = signal<SafeResourceUrl | null>(null);
  readonly translatedPdfUrl = signal<SafeResourceUrl | null>(null);

  ngOnDestroy(): void {
    this._stopStepCycle();
    this._revokeOriginal();
    this._revokeTranslated();
  }

  private _revokeOriginal(): void {
    if (this._originalBlobUrl) { URL.revokeObjectURL(this._originalBlobUrl); this._originalBlobUrl = null; }
    this.originalPdfUrl.set(null);
  }

  private _revokeTranslated(): void {
    if (this._translatedBlobUrl) { URL.revokeObjectURL(this._translatedBlobUrl); this._translatedBlobUrl = null; }
    this.translatedPdfUrl.set(null);
  }

  private _setOriginalUrl(f: File): void {
    this._revokeOriginal();
    this._originalBlobUrl = URL.createObjectURL(f);
    this.originalPdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this._originalBlobUrl));
  }

  private _setTranslatedUrl(base64: string): void {
    this._revokeTranslated();
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    this._translatedBlobUrl = URL.createObjectURL(blob);
    this.translatedPdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this._translatedBlobUrl));
  }

  readonly languages = TRANSLATION_LANGUAGES;

  readonly features = [
    { icon: '📐', titleKey: 'pdf_translate.feature_layout_title',     descKey: 'pdf_translate.feature_layout_desc' },
    { icon: '🧠', titleKey: 'pdf_translate.feature_ai_title',         descKey: 'pdf_translate.feature_ai_desc' },
    { icon: '👁️', titleKey: 'pdf_translate.feature_ocr_title',       descKey: 'pdf_translate.feature_ocr_desc' },
    { icon: '🌍', titleKey: 'pdf_translate.feature_langs_title',      descKey: 'pdf_translate.feature_langs_desc' },
    { icon: '⚡', titleKey: 'pdf_translate.feature_fast_title',       descKey: 'pdf_translate.feature_fast_desc' },
    { icon: '🔧', titleKey: 'pdf_translate.feature_enterprise_title', descKey: 'pdf_translate.feature_enterprise_desc' },
  ];

  readonly fileInfo = computed(() => {
    const f = this.file();
    if (!f) return null;
    return {
      name: f.name,
      size: this.formatBytes(f.size),
      ext: f.name.split('.').pop()?.toUpperCase() ?? 'FILE',
    };
  });

  readonly selectedLangLabel = computed(() => {
    const l = this.languages.find((l) => l.value === this.selectedLanguage());
    return l ? `${l.flag} ${l.label}` : '';
  });

  readonly retranslateLangs = computed(() => {
    const current = this.result()?.targetLanguage;
    return this.languages.filter((l) => l.value !== current);
  });

  onFilesDropped(files: FileList): void {
    const f = files[0];
    if (f) this.setFile(f);
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.setFile(f);
  }

  private setFile(f: File): void {
    const ext = f.name.split('.').pop()?.toLowerCase();
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowed.includes(f.type) && !['pdf', 'docx', 'txt'].includes(ext ?? '')) {
      this.error.set('Only PDF, DOCX, or TXT files are supported.');
      return;
    }
    this.file.set(f);
    this.error.set('');
    this.result.set(null);
    this._revokeTranslated();
    this._setOriginalUrl(f);
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

  triggerFileInput(): void { this.fileInput.nativeElement.click(); }

  removeFile(): void {
    this.file.set(null); this.result.set(null); this.error.set('');
    this._revokeOriginal(); this._revokeTranslated();
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  scrollToUpload(): void {
    this.uploadSection?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  translate(): void {
    const f = this.file();
    if (!f) { this.error.set('Please select a file.'); return; }
    this.error.set('');
    this.result.set(null);

    const options: TranslateOptions = { highFidelity: this.mode() === 'high_fidelity' };

    this._startStepCycle(f.size);

    this.service.translate(f, this.selectedLanguage(), options)
      .pipe(finalize(() => this._stopStepCycle()))
      .subscribe({
        next: (res) => {
          this.result.set(res);
          if (res.pdfBase64) this._setTranslatedUrl(res.pdfBase64);
        },
        error: (err) => {
          const msg = err?.error?.message ?? err?.message ?? 'Translation failed. Please try again.';
          this.error.set(msg);
        },
      });
  }

  retranslate(lang: TranslationLanguage): void {
    if (!this.file() || this.loading()) return;
    this.selectedLanguage.set(lang);
    this.translate();
  }

  copyText(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  downloadPdf(): void {
    const res = this.result();
    if (!res?.pdfBase64) return;
    this.service.downloadPdf(res.pdfBase64, `translated-${res.targetLanguage}-${Date.now()}.pdf`);
  }

  downloadText(text: string): void {
    const res = this.result();
    if (!res) return;
    this.service.downloadText(text, `translated-${res.targetLanguage}-${Date.now()}.txt`);
  }

  sendToWorkspace(): void {
    const res = this.result();
    if (!res) return;
    if (res.pdfBase64) {
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      this.workspace.send({
        kind: 'file',
        blob,
        filename: `translated-${res.targetLanguage}.pdf`,
        mime: 'application/pdf',
        fromTool: 'pdf_translate',
      });
    } else {
      this.workspace.send({
        kind: 'text',
        text: res.translatedText,
        filename: `translated-${res.targetLanguage}.txt`,
        fromTool: 'pdf_translate',
      });
    }
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }

  reset(): void {
    this.file.set(null); this.result.set(null); this.error.set('');
    this._revokeOriginal(); this._revokeTranslated();
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  formatMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
