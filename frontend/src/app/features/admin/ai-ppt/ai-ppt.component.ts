import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import {
  AiPptService,
  PptStyle,
  GeneratePptResult,
  PPT_STYLES,
  SLIDE_COUNT_OPTIONS,
} from '../../../core/services/ai-ppt.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

type ViewMode = 'carousel' | 'grid';

/** Allineato al limite lato backend per il file di contesto opzionale. */
const MAX_CONTEXT_FILE_MB = 20;

@Component({
  selector: 'app-ai-ppt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, FileDropzoneDirective],
  templateUrl: './ai-ppt.component.html',
  styleUrls: ['./ai-ppt.component.scss'],
})
export class AiPptComponent implements OnInit {
  @ViewChild('generatorSection') generatorSection!: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly service   = inject(AiPptService);
  private readonly seo       = inject(SeoService);
  private readonly workspace = inject(WorkspaceService);
  private readonly t         = inject(TranslateService);

  ngOnInit(): void {
    this.seo.update({
      title: 'AI Slides Generator — Create Presentations with AI',
      description: 'Generate a complete professional presentation from any topic in seconds. Up to 20 slides with titles, bullet points, speaker notes and 5 style themes. Free AI presentation maker online.',
      url: 'https://gentsallaku.it/lab/ai-ppt',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'AI Slides Generator',
        description: 'Generate professional presentations from any topic using AI. Up to 20 slides, 5 style themes, speaker notes included.',
        url: 'https://gentsallaku.it/lab/ai-ppt',
        applicationCategory: 'PresentationApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['AI-generated slides', 'Up to 20 slides', '5 style themes', 'Speaker notes', 'Export ready'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How many slides can the AI generate?',
            acceptedAnswer: { '@type': 'Answer', text: 'Choose 5, 10, 15 or 20 slides per presentation.' },
          },
          {
            '@type': 'Question',
            name: 'What presentation styles are available?',
            acceptedAnswer: { '@type': 'Answer', text: 'Five style themes: Business, Education, Minimal, Modern, and Pitch Deck.' },
          },
          {
            '@type': 'Question',
            name: 'Does it include speaker notes?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, every generated deck includes speaker notes and a logical slide-to-slide flow.' },
          },
          {
            '@type': 'Question',
            name: 'Can I give the AI extra context for my presentation?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, you can optionally upload a PDF or TXT file so the AI grounds the generated content in your own material.' },
          },
        ],
      },
    ]);
  }

  readonly loading         = this.service.isLoading;
  readonly topic           = signal('');
  readonly result          = signal<GeneratePptResult | null>(null);
  readonly error           = signal('');
  readonly selectedStyle   = signal<PptStyle>('modern');
  readonly selectedCount   = signal<number>(10);
  readonly viewMode        = signal<ViewMode>('carousel');
  readonly activeSlideIdx  = signal(0);
  readonly contextFile     = signal<File | null>(null);
  readonly isFullscreen    = signal(false);
  readonly copied          = signal(false);
  readonly exporting       = signal(false);
  readonly sending         = signal(false);
  readonly justSent        = signal(false);
  readonly truncatedWarning = signal(false);

  readonly styles      = PPT_STYLES;
  readonly slideCounts = SLIDE_COUNT_OPTIONS;

  readonly contextFileInfo = computed(() => {
    const f = this.contextFile();
    return f ? { name: f.name, size: this.formatBytes(f.size) } : null;
  });

  readonly activeSlide = computed(() => {
    const r = this.result();
    if (!r) return null;
    const idx = this.activeSlideIdx();
    return r.slides[Math.min(idx, r.slides.length - 1)] ?? null;
  });

  readonly totalSlides = computed(() => this.result()?.slides.length ?? 0);

  readonly progressPct = computed(() => {
    const total = this.totalSlides();
    if (total === 0) return 0;
    return Math.round(((this.activeSlideIdx() + 1) / total) * 100);
  });

  readonly features = [
    { icon: '🧠', titleKey: 'ai_ppt.feature_ai_title',     descKey: 'ai_ppt.feature_ai_desc' },
    { icon: '🎨', titleKey: 'ai_ppt.feature_styles_title',  descKey: 'ai_ppt.feature_styles_desc' },
    { icon: '📊', titleKey: 'ai_ppt.feature_slides_title',  descKey: 'ai_ppt.feature_slides_desc' },
    { icon: '⬇️', titleKey: 'ai_ppt.feature_export_title',  descKey: 'ai_ppt.feature_export_desc' },
  ];

  onFilesDropped(files: FileList): void {
    const f = files[0];
    if (f) this.setContextFile(f);
  }
  onFileSelected(event: Event): void {
    const f = (event.target as HTMLInputElement).files?.[0];
    if (f) this.setContextFile(f);
    (event.target as HTMLInputElement).value = '';
  }
  private setContextFile(f: File): void {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'txt', 'docx'].includes(ext)) {
      this.error.set(this.t.instant('ai_ppt.err_file_type'));
      return;
    }
    if (f.size > MAX_CONTEXT_FILE_MB * 1024 * 1024) {
      this.error.set(this.t.instant('ai_ppt.err_file_too_large', { max: MAX_CONTEXT_FILE_MB, name: f.name }));
      return;
    }
    this.contextFile.set(f);
    this.error.set('');
  }
  removeContextFile(): void {
    this.contextFile.set(null);
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }
  triggerFileInput(): void { this.fileInput?.nativeElement.click(); }

  generate(): void {
    const t = this.topic().trim();
    if (!t || t.length < 3) {
      this.error.set(this.t.instant('ai_ppt.err_topic_short'));
      return;
    }
    this.error.set('');
    this.result.set(null);
    this.activeSlideIdx.set(0);

    this.service.generate({
      topic:      t,
      slideCount: this.selectedCount(),
      style:      this.selectedStyle(),
      file:       this.contextFile() ?? undefined,
    }).subscribe({
      next: (res) => {
        this.result.set(res);
        this.activeSlideIdx.set(0);
        setTimeout(() => this.generatorSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      },
      error: (err) => {
        const msg = err?.error?.message ?? this.t.instant('ai_ppt.err_generic');
        this.error.set(Array.isArray(msg) ? msg.join(' ') : msg);
      },
    });
  }

  reset(): void {
    this.result.set(null); this.error.set(''); this.activeSlideIdx.set(0);
    this.topic.set(''); this.contextFile.set(null); this.viewMode.set('carousel');
    this.truncatedWarning.set(false);
  }

  prevSlide(): void { this.activeSlideIdx.update((i) => Math.max(0, i - 1)); }
  nextSlide(): void {
    const max = (this.result()?.slides.length ?? 1) - 1;
    this.activeSlideIdx.update((i) => Math.min(max, i + 1));
  }
  goToSlide(idx: number): void { this.activeSlideIdx.set(idx); }
  toggleFullscreen(): void { this.isFullscreen.update((v) => !v); }
  setViewMode(mode: ViewMode): void { this.viewMode.set(mode); }

  exportSlides(): void {
    const r = this.result();
    if (!r || this.exporting()) return;
    this.exporting.set(true);
    this.truncatedWarning.set(false);
    this.service.exportAsPdf(r)
      .then((truncated) => this.truncatedWarning.set(truncated))
      .finally(() => this.exporting.set(false));
  }

  async sendToWorkspace(): Promise<void> {
    const r = this.result();
    if (!r || this.sending()) return;
    this.sending.set(true);
    try {
      const { blob, truncated } = await this.service.buildPdfBlob(r);
      this.truncatedWarning.set(truncated);
      this.workspace.send({
        kind: 'file',
        blob,
        filename: `${this.service.sanitizeFilename(r.title)}_slides.pdf`,
        mime: 'application/pdf',
        fromTool: 'ai_ppt',
      });
      this.justSent.set(true);
      setTimeout(() => this.justSent.set(false), 1500);
    } finally {
      this.sending.set(false);
    }
  }

  copySlideContent(): void {
    const slide = this.activeSlide();
    if (!slide) return;
    navigator.clipboard.writeText(`${slide.title}\n\n${slide.content}`).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  scrollToGenerator(): void {
    this.generatorSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  bulletLines(content: string): string[] {
    return content
      .split('\n')
      .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
      .filter(Boolean);
  }

  slideStyleClass(idx: number): string {
    const palette = ['slide-blue', 'slide-purple', 'slide-teal', 'slide-indigo', 'slide-pink'];
    return palette[idx % palette.length];
  }

  useSampleTopic(): void {
    const samples = [
      'The Future of Artificial Intelligence in Healthcare',
      'Building a Sustainable Business in 2026',
      'Effective Remote Team Leadership Strategies',
      'The Rise of Electric Vehicles and Clean Energy',
      'Digital Marketing Trends for Modern Brands',
    ];
    this.topic.set(samples[Math.floor(Math.random() * samples.length)]);
  }
}
