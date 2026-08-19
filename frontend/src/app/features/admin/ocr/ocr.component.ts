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
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">🔤 {{ 'ocr.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'ocr.subtitle' | translate }}</p>
      </header>

      <div class="cp-panel">
        <!-- Upload -->
        <div class="dz"
             appFileDropzone
             #dz="fileDropzone"
             (click)="pick.click()"
             (filesDropped)="onFilesDropped($event)"
             [class.dz--active]="files().length > 0 || dz.isDragging">
          <input #pick type="file" hidden multiple [attr.accept]="accept" (change)="select($event)">
          @if (files().length === 0) {
            <span class="dz-icon">📂</span>
            <strong>{{ 'ocr.drop_prompt' | translate }}</strong>
            <small>{{ 'ocr.accepted' | translate }}</small>
          } @else {
            <span class="dz-icon">✅</span>
            <strong>{{ 'ocr.files_selected' | translate: { count: files().length } }}</strong>
            <small>{{ totalSize() }} · {{ 'ocr.add_more' | translate }}</small>
          }
        </div>

        @if (files().length > 0) {
          <ul class="file-list">
            @for (f of files(); track f.name + f.size + $index; let i = $index) {
              <li class="file-item">
                <span class="file-item-name">{{ f.name }}</span>
                <span class="file-item-size">{{ formatSize(f.size) }}</span>
                <button type="button" class="file-item-remove" [disabled]="busy()" (click)="removeFile(i)" [attr.aria-label]="'ocr.remove_file' | translate">✕</button>
              </li>
            }
          </ul>
        }

        <!-- Options -->
        <div class="opts">
          <label class="opt">
            <small>{{ 'ocr.lang_label' | translate }}</small>
            <select class="sel" [value]="lang()" (change)="onLangChange($any($event.target).value)" [disabled]="busy()">
              @for (l of languages; track l.code) {
                <option [value]="l.code">{{ l.label }}</option>
              }
            </select>
          </label>
          <div class="ac">
            @if (fileResults().length > 0 || status() === 'error') {
              <button class="btn btn-s" (click)="reset()">{{ 'ocr.clear' | translate }}</button>
            }
            <button class="btn btn-p" [disabled]="files().length === 0 || busy()" (click)="start()">
              {{ (busy() ? 'ocr.processing' : 'ocr.start') | translate }}
            </button>
          </div>
        </div>

        <!-- Progress -->
        @if (busy()) {
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill"></div></div>
            <small>
              @if (status() === 'preparing') {
                {{ 'ocr.preparing' | translate }}
                @if (files().length > 1 && preparingFile()) {
                  — {{ preparingFile() }}
                }
                {{ progress().current }}/{{ progress().total }}
              } @else {
                {{ 'ocr.recognizing' | translate }}
              }
            </small>
          </div>
        }

        @if (msg()) {
          <p class="msg" [class.msg--ok]="status() === 'done'">{{ msg() }}</p>
        }
      </div>

      <!-- Results -->
      @if (fileResults().length > 0) {
        <section class="cp-panel res">
          <div class="res-head">
            <div>
              <h2>{{ 'ocr.results_title' | translate }}</h2>
              <small class="res-lang">{{ 'ocr.lang_label' | translate }}: {{ resultLangLabel() }}</small>
            </div>
            <div class="res-actions">
              <button class="btn btn-s" (click)="copy()">{{ (copied() ? 'ocr.copied' : 'ocr.copy') | translate }}</button>
              <button class="btn btn-p" (click)="downloadTxt()">{{ 'ocr.download_txt' | translate }}</button>
            </div>
          </div>
          @if (!allText()) {
            <p class="cp-subtitle">{{ 'ocr.no_text' | translate }}</p>
          } @else {
            @for (fr of fileResults(); track fr.name + $index) {
              <div class="file-res">
                @if (fileResults().length > 1) {
                  <h3 class="file-res-name">📄 {{ fr.name }}</h3>
                }
                @if (!fr.text) {
                  <p class="cp-subtitle file-res-empty">{{ 'ocr.no_text' | translate }}</p>
                } @else {
                  <pre class="tx">{{ fr.text }}</pre>
                  @if (fr.pages.length > 1 || hasConfidence(fr)) {
                    <div class="pages">
                      @for (p of fr.pages; track p.index) {
                        <span class="page-chip" [class.page-chip--low]="isLowConfidence(p)">
                          {{ 'ocr.page' | translate }} {{ p.index + 1 }}
                          @if (p.confidence !== null) {
                            · {{ p.confidence }}%
                            @if (isLowConfidence(p)) {
                              <span class="low-conf" [title]="'ocr.low_confidence_hint' | translate">⚠️</span>
                            }
                          } @else {
                            · {{ 'ocr.text_layer' | translate }}
                          }
                        </span>
                      }
                    </div>
                  }
                }
              </div>
            }
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cp-page { min-height: 100%; padding: 2rem; background: var(--bg-primary, #0d1117); max-width: 900px; margin: 0 auto; }
    .cp-header { margin-bottom: 1.75rem; }
    .cp-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary, #e6edf3); margin: 0 0 0.25rem; }
    .cp-subtitle { color: var(--text-secondary, #8b949e); margin: 0; font-size: 0.9rem; }

    .cp-panel {
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; padding: 1.25rem; margin-bottom: 1.25rem; color: var(--text-primary, #e6edf3);
    }

    .dz {
      border: 2px dashed var(--border-color, #30363d); border-radius: 12px; padding: 1.75rem 1rem;
      text-align: center; cursor: pointer; display: grid; gap: 0.3rem; transition: border-color .18s, background .18s;
    }
    .dz:hover { border-color: var(--accent, #6c63ff); background: rgba(108,99,255,.04); }
    .dz--active { border-color: var(--success, #34d399); background: rgba(52,211,153,.04); }
    .dz-icon { font-size: 1.75rem; line-height: 1; }
    .dz small { color: var(--text-secondary, #8b949e); }

    .file-list { list-style: none; margin: .75rem 0 0; padding: 0; display: grid; gap: .4rem; max-height: 220px; overflow-y: auto; }
    .file-item {
      display: flex; align-items: center; gap: .6rem; padding: .4rem .6rem;
      background: var(--bg-primary, #0d1117); border: 1px solid var(--border-color, #30363d); border-radius: 8px;
      font-size: .8rem;
    }
    .file-item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-item-size { color: var(--text-secondary, #8b949e); flex-shrink: 0; }
    .file-item-remove {
      background: transparent; border: none; color: var(--text-secondary, #8b949e); cursor: pointer;
      font-size: .8rem; line-height: 1; padding: .2rem .35rem; border-radius: 6px; flex-shrink: 0;
    }
    .file-item-remove:hover:not(:disabled) { color: var(--danger, #f87171); background: rgba(248,113,113,.08); }
    .file-item-remove:disabled { opacity: .4; cursor: not-allowed; }

    .opts { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
    .opt small { display: block; font-size: 0.72rem; color: var(--text-secondary, #8b949e); margin-bottom: 0.3rem; }
    .sel {
      padding: 0.5rem 0.75rem; border-radius: 9px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-primary, #0d1117); color: var(--text-primary, #e6edf3);
      font-family: inherit; font-size: 0.875rem; min-width: 160px;
    }
    .sel:focus { outline: none; border-color: var(--accent, #6c63ff); }

    .ac { display: flex; gap: .6rem; }
    .btn { padding: .55rem 1.1rem; border-radius: 9px; border: 1px solid transparent; font-family: inherit; font-size: .875rem; font-weight: 500; cursor: pointer; transition: opacity .15s, transform .1s; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn:not(:disabled):active { transform: scale(.97); }
    .btn-p { background: var(--accent, #6c63ff); color: #fff; font-weight: 600; }
    .btn-p:not(:disabled):hover { background: #5851e5; }
    .btn-s { background: transparent; color: var(--text-primary, #e6edf3); border-color: var(--border-color, #30363d); }
    .btn-s:hover { background: var(--bg-tertiary, #1c2333); }

    .progress-wrap { margin: 1rem 0 0; text-align: center; }
    .progress-wrap small { color: var(--text-secondary, #8b949e); }
    .progress-bar { height: 3px; background: var(--bg-tertiary,#1c2333); border-radius: 2px; overflow: hidden; margin-bottom: .4rem; }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, var(--accent,#6c63ff), #a855f7); border-radius: 2px;
      animation: prog 1.4s ease-in-out infinite;
    }
    @keyframes prog { 0% { width: 0; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 0; margin-left: 100%; } }

    .msg { padding: .55rem .8rem; border-radius: 8px; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); font-size: .85rem; color: var(--warning, #fbbf24); margin: 1rem 0 0; }
    .msg--ok { background: rgba(52,211,153,.08); border-color: rgba(52,211,153,.3); color: var(--success, #34d399); }

    .res-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .res-head h2 { margin: 0; font-size: 1.05rem; }
    .res-lang { color: var(--text-secondary, #8b949e); }
    .res-actions { display: flex; gap: .6rem; }

    .file-res { margin-bottom: 1.5rem; }
    .file-res:last-child { margin-bottom: 0; }
    .file-res-name { margin: 0 0 .5rem; font-size: .85rem; font-weight: 600; color: var(--text-primary, #e6edf3); }
    .file-res-empty { margin: 0; }

    .tx {
      padding: .8rem; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: .82rem;
      background: var(--bg-primary,#0d1117); color: var(--text-primary,#e6edf3);
      border: 1px solid var(--border-color, #30363d); border-radius: 8px; max-height: 420px; margin: 0;
    }
    .pages { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .8rem; }
    .page-chip {
      font-size: .72rem; padding: .2rem .55rem; border-radius: 999px;
      background: var(--bg-tertiary, #1c2333); border: 1px solid var(--border-color, #30363d);
      color: var(--text-secondary, #8b949e);
    }
    .page-chip--low {
      background: rgba(251,191,36,.1); border-color: rgba(251,191,36,.4); color: var(--warning, #fbbf24);
    }
    .low-conf { margin-left: .15rem; }

    @media (max-width: 600px) {
      .cp-page { padding: 1rem; }
      .cp-title { font-size: 1.35rem; }
      .opts { flex-direction: column; align-items: stretch; }
      .ac { justify-content: flex-end; }
    }
  `],
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
