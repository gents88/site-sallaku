import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OcrService, OcrResult, OCR_LANGUAGES } from '../../../core/services/ocr.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';

type Status = 'idle' | 'preparing' | 'recognizing' | 'done' | 'error';

interface PageText {
  index: number;
  text: string;
  confidence: number | null; // null → estratto dal text layer, non OCR
}

const MAX_PDF_PAGES = 20;
const IMG_ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.tiff,.pdf';
const LANG_STORAGE_KEY = 'ocr-lang';
const UI_TO_OCR_LANG: Record<string, string> = {
  it: 'ita', en: 'eng', es: 'spa', fr: 'fra', de: 'deu', pt: 'por', sq: 'sqi',
};

@Component({
  selector: 'app-ocr',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">🔤 {{ 'ocr.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'ocr.subtitle' | translate }}</p>
      </header>

      <div class="cp-panel">
        <!-- Upload -->
        <div class="dz"
             (click)="pick.click()"
             (dragover)="$event.preventDefault()"
             (drop)="drop($event)"
             [class.dz--active]="file()">
          <input #pick type="file" hidden [attr.accept]="accept" (change)="select($event)">
          @if (!file()) {
            <span class="dz-icon">📂</span>
            <strong>{{ 'ocr.drop_prompt' | translate }}</strong>
            <small>{{ 'ocr.accepted' | translate }}</small>
          } @else {
            <span class="dz-icon">✅</span>
            <strong>{{ file()!.name }}</strong>
            <small>{{ size() }} · {{ 'ocr.change_file' | translate }}</small>
          }
        </div>

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
            @if (result() || status() === 'error') {
              <button class="btn btn-s" (click)="reset()">{{ 'ocr.clear' | translate }}</button>
            }
            <button class="btn btn-p" [disabled]="!file() || busy()" (click)="start()">
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
                {{ 'ocr.preparing' | translate }} {{ progress().current }}/{{ progress().total }}
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
      @if (result(); as res) {
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
          @if (!res.text) {
            <p class="cp-subtitle">{{ 'ocr.no_text' | translate }}</p>
          } @else {
            <pre class="tx">{{ res.text }}</pre>
            @if (res.pages.length > 1) {
              <div class="pages">
                @for (p of pages(); track p.index) {
                  <span class="page-chip">
                    {{ 'ocr.page' | translate }} {{ p.index + 1 }}
                    @if (p.confidence !== null) {
                      · {{ p.confidence }}%
                    } @else {
                      · {{ 'ocr.text_layer' | translate }}
                    }
                  </span>
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

  readonly file = signal<File | null>(null);
  readonly lang = signal(this.defaultLang());
  readonly status = signal<Status>('idle');
  readonly progress = signal({ current: 0, total: 0 });
  readonly result = signal<OcrResult | null>(null);
  readonly pages = signal<PageText[]>([]);
  readonly msg = signal('');
  readonly copied = signal(false);

  readonly busy = computed(() => this.status() === 'preparing' || this.status() === 'recognizing');
  readonly size = computed(() => {
    const f = this.file();
    if (!f) return '';
    const kb = f.size / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  });
  readonly resultLangLabel = computed(() => {
    const code = this.result()?.lang ?? this.lang();
    return this.languages.find((l) => l.code === code)?.label ?? code;
  });

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Online OCR — Extract Text from Images & Scanned PDFs',
      description: 'Extract text from photos, scanned documents and PDFs in 7 languages. Free online OCR, no signup required.',
      url: 'https://gentsallaku.it/dashboard/ocr',
    });
  }

  select(e: Event): void { this.setFile((e.target as HTMLInputElement).files?.[0] ?? null); }
  drop(e: DragEvent): void { e.preventDefault(); this.setFile(e.dataTransfer?.files?.[0] ?? null); }

  onLangChange(code: string): void {
    this.lang.set(code);
    try { localStorage.setItem(LANG_STORAGE_KEY, code); } catch { /* storage unavailable */ }
  }

  reset(): void {
    this.file.set(null);
    this.result.set(null);
    this.pages.set([]);
    this.msg.set('');
    this.status.set('idle');
  }

  async start(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;

    this.result.set(null);
    this.pages.set([]);
    this.msg.set('');
    this.copied.set(false);

    try {
      if (this.isPdf(f)) {
        await this.processPdf(f);
      } else {
        await this.processImages([{ blob: f, name: f.name }], []);
      }
    } catch (err) {
      this.status.set('error');
      this.msg.set(`❌ ${this.errText(err)}`);
    }
  }

  copy(): void {
    const text = this.result()?.text ?? '';
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  downloadTxt(): void {
    const text = this.result()?.text ?? '';
    const name = this.file()?.name.replace(/\.[^.]+$/, '') || 'ocr-result';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private defaultLang(): string {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && this.languages.some((l) => l.code === saved)) return saved;
    } catch { /* storage unavailable */ }
    return UI_TO_OCR_LANG[this.t.currentLang] ?? 'eng';
  }

  private setFile(f: File | null): void {
    if (!f) return;
    this.reset();
    this.file.set(f);
  }

  private isPdf(f: File): boolean {
    return f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf');
  }

  /**
   * PDF: per ogni pagina prova prima il text layer (gratis, istantaneo);
   * solo le pagine senza testo vengono rasterizzate e mandate all'OCR.
   */
  private async processPdf(f: File): Promise<void> {
    this.status.set('preparing');
    const doc = await this.pdfjs.openDocument(await f.arrayBuffer());
    const total = Math.min(doc.numPages, MAX_PDF_PAGES);
    this.progress.set({ current: 0, total });

    const textPages: PageText[] = [];
    const toOcr: { blob: Blob; name: string; index: number }[] = [];

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
        textPages.push({ index: i - 1, text, confidence: null });
      } else {
        const blob = await this.pdfjs.renderPageToBlob(page, 2);
        toOcr.push({ blob, name: `page-${i}.png`, index: i - 1 });
      }
    }
    const truncated = doc.numPages > MAX_PDF_PAGES;
    await doc.loadingTask.destroy();

    if (truncated) {
      this.msg.set(this.t.instant('ocr.pages_truncated', { max: MAX_PDF_PAGES }));
    }

    await this.processImages(toOcr, textPages);
  }

  /** Manda le immagini all'OCR backend e unisce i risultati con le pagine da text layer. */
  private async processImages(
    toOcr: { blob: Blob; name: string; index?: number }[],
    textPages: PageText[],
  ): Promise<void> {
    let merged = [...textPages];

    if (toOcr.length > 0) {
      this.status.set('recognizing');
      const res = await new Promise<OcrResult>((resolve, reject) => {
        this.svc.extract(toOcr, this.lang()).subscribe({ next: resolve, error: reject });
      });
      merged = merged.concat(
        res.pages.map((p, i) => ({
          index: toOcr[i].index ?? i,
          text: p.text,
          confidence: p.confidence,
        })),
      );
    }

    merged.sort((a, b) => a.index - b.index);
    const text = merged.map((p) => p.text).filter(Boolean).join('\n\n');

    this.pages.set(merged);
    this.result.set({ lang: this.lang(), pages: merged.map((p, i) => ({ index: i, text: p.text, confidence: p.confidence ?? 100 })), text });
    this.status.set('done');
    if (!this.msg()) this.msg.set(`✅ ${this.t.instant('ocr.success')}`);
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
