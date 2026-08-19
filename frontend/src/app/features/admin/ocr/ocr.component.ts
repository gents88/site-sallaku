import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OcrService, OcrResult, OcrPageResult, OCR_LANGUAGES } from '../../../core/services/ocr.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';

type Status = 'idle' | 'preparing' | 'recognizing' | 'done' | 'error';

interface PageText {
  index: number;
  text: string;
  confidence: number | null; // null → estratto dal text layer, non OCR
}

/** Risultato OCR raggruppato per file sorgente (un file può avere più pagine se è un PDF). */
interface FileResult {
  name: string;
  pages: PageText[];
  text: string;
}

const MAX_PDF_PAGES = 20;
/** Allineati ai limiti del backend (vedi ocr.controller.ts: MAX_FILE_COUNT / MAX_FILE_SIZE). */
const MAX_FILES = 30;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
/** Sotto questa soglia (%) la confidenza OCR di una pagina viene segnalata come bassa. */
const LOW_CONFIDENCE_THRESHOLD = 60;

const IMG_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff,.pdf';
const LANG_STORAGE_KEY = 'ocr-lang';
const UI_TO_OCR_LANG: Record<string, string> = {
  it: 'ita', en: 'eng', es: 'spa', fr: 'fra', de: 'deu', pt: 'por', sq: 'sqi',
};

@Component({
  selector: 'app-ocr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, FileDropzoneDirective],
  templateUrl: './ocr.component.html',
  styleUrls: ['./ocr.component.scss'],
})
export class OcrComponent implements OnInit {
  private readonly svc = inject(OcrService);
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  readonly accept = IMG_ACCEPT;
  readonly languages = OCR_LANGUAGES;

  readonly files = signal<File[]>([]);
  readonly lang = signal(this.defaultLang());
  readonly status = signal<Status>('idle');
  readonly progress = signal({ current: 0, total: 0 });
  readonly preparingFile = signal('');
  readonly fileResults = signal<FileResult[]>([]);
  readonly resultLang = signal<string | null>(null);
  readonly msg = signal('');
  readonly copied = signal(false);

  readonly busy = computed(() => this.status() === 'preparing' || this.status() === 'recognizing');
  readonly totalSize = computed(() => this.formatSize(this.files().reduce((sum, f) => sum + f.size, 0)));
  readonly allText = computed(() => this.fileResults().map((fr) => fr.text).filter(Boolean).join('\n\n'));
  readonly resultLangLabel = computed(() => {
    const code = this.resultLang() ?? this.lang();
    return this.languages.find((l) => l.code === code)?.label ?? code;
  });

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Online OCR — Extract Text from Images & Scanned PDFs',
      description: 'Extract text from photos, scanned documents and PDFs in 7 languages. Free online OCR, no signup required.',
      url: 'https://gentsallaku.it/lab/ocr',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Free Online OCR',
        description: 'Extract text from photos, scanned documents and PDFs in 7 languages, directly in the browser.',
        url: 'https://gentsallaku.it/lab/ocr',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['7 languages', 'Images & scanned PDFs', 'PNG/JPG/WEBP/BMP/TIFF/PDF support', 'No signup required'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What file formats does the OCR tool support?',
            acceptedAnswer: { '@type': 'Answer', text: 'PNG, JPG, WEBP, BMP, TIFF images and PDF documents, including scanned PDFs.' },
          },
          {
            '@type': 'Question',
            name: 'How many languages does it recognize?',
            acceptedAnswer: { '@type': 'Answer', text: 'Text recognition is available in 7 languages, selectable before processing.' },
          },
          {
            '@type': 'Question',
            name: 'Do I need to sign up to use it?',
            acceptedAnswer: { '@type': 'Answer', text: "No signup is required — it's free to use directly in the browser." },
          },
        ],
      },
    ]);
  }

  select(e: Event): void {
    const input = e.target as HTMLInputElement;
    const list = Array.from(input.files ?? []);
    input.value = '';
    this.addFiles(list);
  }

  onFilesDropped(files: FileList): void { this.addFiles(Array.from(files)); }

  removeFile(i: number): void {
    this.files.update((all) => all.filter((_, idx) => idx !== i));
    this.fileResults.set([]);
    this.status.set('idle');
  }

  onLangChange(code: string): void {
    this.lang.set(code);
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch { /* storage unavailable */ }
  }

  reset(): void {
    this.files.set([]);
    this.fileResults.set([]);
    this.msg.set('');
    this.status.set('idle');
  }

  async start(): Promise<void> {
    const fs = this.files();
    if (fs.length === 0 || this.busy()) return;

    this.fileResults.set([]);
    this.msg.set('');
    this.copied.set(false);
    this.resultLang.set(this.lang());

    try {
      await this.processBatch(fs);
    } catch (err) {
      this.status.set('error');
      this.msg.set(`❌ ${this.errText(err)}`);
    }
  }

  copy(): void {
    navigator.clipboard.writeText(this.allText()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  downloadTxt(): void {
    const fs = this.files();
    const name = fs.length === 1 ? fs[0].name.replace(/\.[^.]+$/, '') : 'ocr-result';
    const url = URL.createObjectURL(new Blob([this.allText()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  isLowConfidence(p: PageText): boolean {
    return p.confidence !== null && p.confidence < LOW_CONFIDENCE_THRESHOLD;
  }

  hasConfidence(fr: FileResult): boolean {
    return fr.pages.some((p) => p.confidence !== null);
  }

  formatSize(bytes: number): string {
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private defaultLang(): string {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && this.languages.some((l) => l.code === saved)) return saved;
    } catch { /* storage unavailable */ }
    return UI_TO_OCR_LANG[this.t.currentLang] ?? 'eng';
  }

  private addFiles(newFiles: File[]): void {
    if (this.busy() || newFiles.length === 0) return;

    const tooLarge: string[] = [];
    const accepted: File[] = [];
    for (const f of newFiles) {
      if (!this.isPdf(f) && f.size > MAX_FILE_SIZE_BYTES) {
        tooLarge.push(f.name);
      } else {
        accepted.push(f);
      }
    }

    const combined = [...this.files(), ...accepted];
    if (combined.length > MAX_FILES) {
      this.msg.set(`❌ ${this.t.instant('ocr.err_too_many_files', { max: MAX_FILES })}`);
      return;
    }

    this.files.set(combined);
    this.fileResults.set([]);
    this.status.set('idle');
    this.msg.set(
      tooLarge.length > 0
        ? `❌ ${this.t.instant('ocr.err_file_too_large', { names: tooLarge.join(', '), max: 15 })}`
        : '',
    );
  }

  private isPdf(f: File): boolean {
    return f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
  }

  /**
   * Elabora tutti i file selezionati: per ogni PDF prova prima il text layer per
   * pagina (gratis, istantaneo), solo le pagine senza testo vengono rasterizzate;
   * le immagini vanno direttamente in coda OCR. Tutte le immagini raccolte da
   * tutti i file vengono poi mandate al backend in un'unica chiamata batch.
   */
  private async processBatch(fs: File[]): Promise<void> {
    this.status.set('preparing');

    const perFileTextPages: PageText[][] = fs.map(() => []);
    const toOcr: { blob: Blob; name: string; fileIdx: number; pageIndex: number }[] = [];
    let truncatedAny = false;

    for (let fi = 0; fi < fs.length; fi++) {
      const f = fs[fi];
      if (this.isPdf(f)) {
        const truncated = await this.collectPdfPages(f, fi, perFileTextPages[fi], toOcr);
        if (truncated) truncatedAny = true;
      } else {
        toOcr.push({ blob: f, name: f.name, fileIdx: fi, pageIndex: 0 });
      }
    }
    this.preparingFile.set('');

    if (toOcr.length > MAX_FILES) {
      this.status.set('error');
      this.msg.set(`❌ ${this.t.instant('ocr.err_too_many_pages', { count: toOcr.length, max: MAX_FILES })}`);
      return;
    }

    let ocrPages: OcrPageResult[] = [];
    if (toOcr.length > 0) {
      this.status.set('recognizing');
      const res = await new Promise<OcrResult>((resolve, reject) => {
        this.svc.extract(toOcr, this.lang()).subscribe({ next: resolve, error: reject });
      });
      ocrPages = res.pages;
    }

    ocrPages.forEach((p, i) => {
      const meta = toOcr[i];
      perFileTextPages[meta.fileIdx].push({ index: meta.pageIndex, text: p.text, confidence: p.confidence });
    });

    const results: FileResult[] = fs.map((f, fi) => {
      const pages = [...perFileTextPages[fi]].sort((a, b) => a.index - b.index);
      return { name: f.name, pages, text: pages.map((p) => p.text).filter(Boolean).join('\n\n') };
    });

    this.fileResults.set(results);
    this.status.set('done');
    if (truncatedAny) this.msg.set(this.t.instant('ocr.pages_truncated', { max: MAX_PDF_PAGES }));
    if (!this.msg()) this.msg.set(`✅ ${this.t.instant('ocr.success')}`);
  }

  /** Estrae il testo layer o accoda per OCR le pagine di un singolo PDF. Ritorna true se il PDF è stato troncato a MAX_PDF_PAGES. */
  private async collectPdfPages(
    f: File,
    fileIdx: number,
    textPagesOut: PageText[],
    toOcrOut: { blob: Blob; name: string; fileIdx: number; pageIndex: number }[],
  ): Promise<boolean> {
    this.preparingFile.set(f.name);
    const doc = await this.pdfjs.openDocument(await f.arrayBuffer());
    const total = Math.min(doc.numPages, MAX_PDF_PAGES);
    this.progress.set({ current: 0, total });

    for (let i = 1; i <= total; i++) {
      this.progress.set({ current: i, total });
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length >= 40) {
        textPagesOut.push({ index: i - 1, text, confidence: null });
      } else {
        const blob = await this.pdfjs.renderPageToBlob(page, 2);
        toOcrOut.push({ blob, name: `${f.name}-page-${i}.png`, fileIdx, pageIndex: i - 1 });
      }
    }
    const truncated = doc.numPages > MAX_PDF_PAGES;
    await doc.loadingTask.destroy();
    return truncated;
  }

  private errText(err: unknown): string {
    const e = err as { status?: number; error?: { message?: string | string[] } };
    if (e?.status === 429) return this.t.instant('ocr.err_rate_limit');
    if (e?.status === 413) return this.t.instant('ocr.err_too_large');
    const detail = e?.error?.message;
    if (Array.isArray(detail)) return detail.join('; ');
    if (typeof detail === 'string') return detail;
    return this.t.instant('ocr.err_failed');
  }
}
