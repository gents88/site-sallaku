import {
  Component, ChangeDetectionStrategy, OnInit, inject, signal, computed,
} from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';

interface SourcePdf {
  bytes: Uint8Array; // per pdf-lib (export)
  name: string;
}

interface PageEntry {
  id: number;
  src: number;    // indice in sources
  page: number;   // indice pagina 0-based nel sorgente
  rot: 0 | 90 | 180 | 270; // rotazione extra applicata all'export
  thumb: string | null;
}

@Component({
  selector: 'app-pdf-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">🖊️ {{ 'pdf_editor.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'pdf_editor.subtitle' | translate }}</p>
      </header>

      <!-- ── Upload / merge ───────────────────────── -->
      <div class="cp-panel">
        <div class="dz"
             (click)="pick.click()"
             (dragover)="$event.preventDefault()"
             (drop)="drop($event)"
             [class.dz--active]="pages().length > 0">
          <input #pick type="file" hidden accept=".pdf" multiple (change)="select($event)">
          @if (pages().length === 0) {
            <span class="dz-icon">📂</span>
            <strong>{{ 'pdf_editor.drop_prompt' | translate }}</strong>
            <small>{{ 'pdf_editor.drop_hint' | translate }}</small>
          } @else {
            <span class="dz-icon">➕</span>
            <strong>{{ 'pdf_editor.add_more' | translate }}</strong>
            <small>{{ sourceNames() }}</small>
          }
        </div>
        @if (loading()) {
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill"></div></div>
          </div>
        }
        @if (msg()) {
          <p class="msg" [class.msg--ok]="msgOk()">{{ msg() }}</p>
        }
      </div>

      @if (pages().length > 0) {
        <!-- ── Pagine ───────────────────────────────── -->
        <section class="cp-panel">
          <div class="res-head">
            <h2>{{ 'pdf_editor.pages_title' | translate }} ({{ pages().length }})</h2>
            <p class="hint-line">{{ 'pdf_editor.pages_hint' | translate }}</p>
          </div>
          <div class="pages-grid">
            @for (p of pages(); track p.id; let i = $index) {
              <figure class="page-card">
                @if (p.thumb) {
                  <img [src]="p.thumb" [style.transform]="'rotate(' + p.rot + 'deg)'" alt="p. {{ i + 1 }}">
                } @else {
                  <span class="page-ph">{{ i + 1 }}</span>
                }
                <figcaption>
                  <span>{{ i + 1 }}</span>
                  <span class="page-btns">
                    <button (click)="rotate(i)" aria-label="rotate">⟳</button>
                    <button [disabled]="i === 0" (click)="move(i, -1)" aria-label="move left">←</button>
                    <button [disabled]="i === pages().length - 1" (click)="move(i, 1)" aria-label="move right">→</button>
                    <button [disabled]="pages().length === 1" (click)="remove(i)" aria-label="delete">🗑</button>
                  </span>
                </figcaption>
              </figure>
            }
          </div>
        </section>

        <!-- ── Export ───────────────────────────────── -->
        <section class="cp-panel">
          <div class="exp-grid">
            <label class="opt">
              <small>{{ 'pdf_editor.watermark_label' | translate }}</small>
              <input class="in" type="text" maxlength="60"
                     [placeholder]="'pdf_editor.watermark_placeholder' | translate"
                     [value]="watermark()" (input)="watermark.set($any($event.target).value)">
            </label>
            <label class="opt">
              <small>{{ 'pdf_editor.range_label' | translate }}</small>
              <input class="in" type="text"
                     [placeholder]="'pdf_editor.range_placeholder' | translate"
                     [value]="range()" (input)="range.set($any($event.target).value)">
            </label>
            <div class="ac">
              <button class="btn btn-s" [disabled]="exporting()" (click)="reset()">{{ 'pdf_editor.clear' | translate }}</button>
              <button class="btn btn-p" [disabled]="exporting()" (click)="exportPdf()">
                {{ (exporting() ? 'pdf_editor.exporting' : 'pdf_editor.export') | translate }}
              </button>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cp-page { min-height: 100%; padding: 2rem; background: var(--bg-primary, #0d1117); max-width: 1100px; margin: 0 auto; }
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
    .dz--active { padding: 1rem; }
    .dz-icon { font-size: 1.75rem; line-height: 1; }
    .dz small { color: var(--text-secondary, #8b949e); word-break: break-all; }

    .res-head { margin-bottom: 1rem; }
    .res-head h2 { margin: 0 0 .25rem; font-size: 1.05rem; }
    .hint-line { font-size: .78rem; color: var(--text-secondary, #8b949e); margin: 0; }

    .pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: .75rem; }
    .page-card { margin: 0; border: 1px solid var(--border-color, #30363d); border-radius: 10px; overflow: hidden; background: var(--bg-primary, #0d1117); }
    .page-card img { width: 100%; aspect-ratio: 3/4; object-fit: contain; display: block; background: #fff; transition: transform .2s; }
    .page-ph {
      width: 100%; aspect-ratio: 3/4; display: grid; place-items: center;
      background: var(--bg-tertiary, #1c2333); color: var(--text-secondary, #8b949e); font-size: .9rem;
    }
    .page-card figcaption { display: flex; align-items: center; justify-content: space-between; padding: .3rem .5rem; font-size: .75rem; color: var(--text-secondary, #8b949e); }
    .page-btns { display: flex; gap: .1rem; }
    .page-btns button {
      background: none; border: none; color: var(--text-secondary, #8b949e); cursor: pointer;
      font-size: .78rem; padding: .1rem .22rem; border-radius: 4px;
    }
    .page-btns button:hover:not(:disabled) { color: var(--text-primary, #e6edf3); background: var(--bg-tertiary, #1c2333); }
    .page-btns button:disabled { opacity: .35; cursor: not-allowed; }

    .exp-grid { display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
    .opt { flex: 1; min-width: 200px; }
    .opt small { display: block; font-size: 0.72rem; color: var(--text-secondary, #8b949e); margin-bottom: 0.3rem; }
    .in {
      width: 100%; padding: 0.5rem 0.75rem; border-radius: 9px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-primary, #0d1117); color: var(--text-primary, #e6edf3);
      font-family: inherit; font-size: 0.875rem; box-sizing: border-box;
    }
    .in:focus { outline: none; border-color: var(--accent, #6c63ff); }

    .ac { display: flex; gap: .6rem; }
    .btn { padding: .55rem 1.1rem; border-radius: 9px; border: 1px solid transparent; font-family: inherit; font-size: .875rem; font-weight: 500; cursor: pointer; transition: opacity .15s, transform .1s; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }
    .btn:not(:disabled):active { transform: scale(.97); }
    .btn-p { background: var(--accent, #6c63ff); color: #fff; font-weight: 600; }
    .btn-p:not(:disabled):hover { background: #5851e5; }
    .btn-s { background: transparent; color: var(--text-primary, #e6edf3); border-color: var(--border-color, #30363d); }
    .btn-s:hover { background: var(--bg-tertiary, #1c2333); }

    .progress-wrap { margin-top: 1rem; }
    .progress-bar { height: 3px; background: var(--bg-tertiary,#1c2333); border-radius: 2px; overflow: hidden; }
    .progress-fill {
      height: 100%; background: linear-gradient(90deg, var(--accent,#6c63ff), #a855f7); border-radius: 2px;
      animation: prog 1.4s ease-in-out infinite;
    }
    @keyframes prog { 0% { width: 0; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 0; margin-left: 100%; } }

    .msg { padding: .55rem .8rem; border-radius: 8px; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); font-size: .85rem; color: var(--warning, #fbbf24); margin: 1rem 0 0; }
    .msg--ok { background: rgba(52,211,153,.08); border-color: rgba(52,211,153,.3); color: var(--success, #34d399); }

    @media (max-width: 600px) {
      .cp-page { padding: 1rem; }
      .cp-title { font-size: 1.35rem; }
      .exp-grid { flex-direction: column; align-items: stretch; }
      .ac { justify-content: flex-end; }
    }
  `],
})
export class PdfEditorComponent implements OnInit {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  readonly pages = signal<PageEntry[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly watermark = signal('');
  readonly range = signal('');

  readonly sourceNames = computed(() => {
    this.pages(); // ricalcola quando cambiano le pagine
    return this.sources.map((s) => s.name).join(' · ');
  });

  private sources: SourcePdf[] = [];
  private nextId = 1;

  ngOnInit(): void {
    this.seo.update({
      title: 'Free PDF Editor — Merge, Split, Rotate & Watermark',
      description: 'Merge PDFs, split and extract pages, rotate or delete pages and add watermarks — entirely in your browser, files never leave your device.',
      url: 'https://gentsallaku.it/dashboard/pdf-editor',
    });
  }

  select(e: Event): void {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    void this.addFiles(files);
  }

  drop(e: DragEvent): void {
    e.preventDefault();
    void this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  rotate(i: number): void {
    this.pages.update((all) => {
      const next = [...all];
      next[i] = { ...next[i], rot: ((next[i].rot + 90) % 360) as PageEntry['rot'] };
      return next;
    });
  }

  move(i: number, dir: -1 | 1): void {
    this.pages.update((all) => {
      const next = [...all];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  }

  remove(i: number): void {
    this.pages.update((all) => all.filter((_, idx) => idx !== i));
  }

  reset(): void {
    this.sources = [];
    this.pages.set([]);
    this.watermark.set('');
    this.range.set('');
    this.msg.set('');
  }

  async exportPdf(): Promise<void> {
    const selected = this.selectedEntries();
    if (!selected) {
      this.msg.set(`❌ ${this.t.instant('pdf_editor.err_range')}`);
      this.msgOk.set(false);
      return;
    }
    if (selected.length === 0 || this.exporting()) return;

    this.exporting.set(true);
    this.msg.set('');
    this.msgOk.set(false);

    try {
      const { PDFDocument, degrees, rgb, StandardFonts } = await import('pdf-lib');
      const srcDocs = await Promise.all(this.sources.map((s) => PDFDocument.load(s.bytes)));
      const out = await PDFDocument.create();

      for (const entry of selected) {
        const [copied] = await out.copyPages(srcDocs[entry.src], [entry.page]);
        if (entry.rot !== 0) {
          copied.setRotation(degrees((copied.getRotation().angle + entry.rot) % 360));
        }
        out.addPage(copied);
      }

      const wm = this.watermark().trim();
      if (wm) {
        const font = await out.embedFont(StandardFonts.HelveticaBold);
        for (const page of out.getPages()) {
          const { width, height } = page.getSize();
          const size = Math.min(64, (width * 1.4) / Math.max(wm.length, 4));
          const textWidth = font.widthOfTextAtSize(wm, size);
          const cos = Math.cos(Math.PI / 4);
          page.drawText(wm, {
            x: width / 2 - (textWidth / 2) * cos,
            y: height / 2 - (textWidth / 2) * cos,
            size,
            font,
            color: rgb(0.55, 0.55, 0.55),
            opacity: 0.3,
            rotate: degrees(45),
          });
        }
      }

      const bytes = await out.save();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = this.outputName();
      a.click();
      URL.revokeObjectURL(url);
      this.msg.set(`✅ ${this.t.instant('pdf_editor.success')}`);
      this.msgOk.set(true);
    } catch {
      this.msg.set(`❌ ${this.t.instant('pdf_editor.err_failed')}`);
    } finally {
      this.exporting.set(false);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async addFiles(files: File[]): Promise<void> {
    const pdfs = files.filter((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) return;
    this.loading.set(true);
    this.msg.set('');

    try {
      for (const f of pdfs) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const srcIdx = this.sources.length;
        this.sources.push({ bytes, name: f.name });

        // pdfjs trasferisce (e stacca) il buffer al worker → passare una copia
        const doc = await this.pdfjs.openDocument(bytes.slice().buffer);
        const entries: PageEntry[] = Array.from({ length: doc.numPages }, (_, i) => ({
          id: this.nextId++, src: srcIdx, page: i, rot: 0, thumb: null,
        }));
        this.pages.update((all) => [...all, ...entries]);

        for (const entry of entries) {
          const page = await doc.getPage(entry.page + 1);
          const viewport = page.getViewport({ scale: 130 / page.getViewport({ scale: 1 }).width });
          const c = document.createElement('canvas');
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          await page.render({ canvas: c, viewport }).promise;
          const thumb = c.toDataURL('image/jpeg', 0.6);
          this.pages.update((all) => all.map((p) => (p.id === entry.id ? { ...p, thumb } : p)));
        }
        await doc.loadingTask.destroy();
      }
    } catch {
      this.msg.set(`❌ ${this.t.instant('pdf_editor.err_open')}`);
    } finally {
      this.loading.set(false);
    }
  }

  /** Applica il range "1-3,5" alle pagine correnti; null = range non valido. */
  private selectedEntries(): PageEntry[] | null {
    const all = this.pages();
    const raw = this.range().trim();
    if (!raw) return all;

    const picked = new Set<number>();
    for (const part of raw.split(',')) {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) return null;
      const from = parseInt(m[1], 10);
      const to = m[2] ? parseInt(m[2], 10) : from;
      if (from < 1 || to > all.length || from > to) return null;
      for (let i = from; i <= to; i++) picked.add(i - 1);
    }
    return all.filter((_, i) => picked.has(i));
  }

  private outputName(): string {
    const base = this.sources[0]?.name.replace(/\.pdf$/i, '') || 'document';
    return `${base}-edited.pdf`;
  }
}
