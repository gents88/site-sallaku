import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef,
  ViewChild, inject, signal, computed,
} from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';

interface SearchMatch { page: number; }

const MAX_THUMBS = 200;

@Component({
  selector: 'app-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">👁 {{ 'viewer.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'viewer.subtitle' | translate }}</p>
      </header>

      <!-- ── Upload ─────────────────────────────── -->
      @if (!doc()) {
        <div class="cp-panel">
          <div class="dz"
               (click)="pick.click()"
               (dragover)="$event.preventDefault()"
               (drop)="drop($event)">
            <input #pick type="file" hidden accept=".pdf" (change)="select($event)">
            <span class="dz-icon">📂</span>
            <strong>{{ 'viewer.drop_prompt' | translate }}</strong>
            <small>PDF</small>
          </div>
          @if (msg()) {
            <p class="msg">{{ msg() }}</p>
          }
        </div>
      } @else {
        <!-- ── Toolbar ──────────────────────────── -->
        <div class="vw-toolbar">
          <div class="vw-group">
            <button class="tb" (click)="goTo(pageNum() - 1)" [disabled]="pageNum() <= 1" aria-label="prev">‹</button>
            <span class="vw-pageinfo">
              <input class="vw-pagein" type="number" min="1" [max]="numPages()"
                     [value]="pageNum()" (change)="goTo(+$any($event.target).value)">
              / {{ numPages() }}
            </span>
            <button class="tb" (click)="goTo(pageNum() + 1)" [disabled]="pageNum() >= numPages()" aria-label="next">›</button>
          </div>

          <div class="vw-group">
            <button class="tb" (click)="zoomBy(-0.25)" [disabled]="scale() <= 0.5" aria-label="zoom out">−</button>
            <span class="vw-zoom">{{ zoomPct() }}%</span>
            <button class="tb" (click)="zoomBy(0.25)" [disabled]="scale() >= 4" aria-label="zoom in">+</button>
            <button class="tb tb--wide" (click)="fitWidth()">{{ 'viewer.fit_width' | translate }}</button>
          </div>

          <div class="vw-group vw-search">
            <input class="vw-searchin" type="search"
                   [placeholder]="'viewer.search_placeholder' | translate"
                   [value]="query()"
                   (change)="search($any($event.target).value)"
                   (keydown.enter)="search($any($event.target).value)">
            @if (query()) {
              <span class="vw-matches">
                @if (searching()) { … } @else {
                  {{ matches().length === 0 ? ('viewer.no_matches' | translate) : (matchIdx() + 1) + '/' + matches().length }}
                }
              </span>
              <button class="tb" (click)="nextMatch(-1)" [disabled]="matches().length === 0" aria-label="prev match">↑</button>
              <button class="tb" (click)="nextMatch(1)" [disabled]="matches().length === 0" aria-label="next match">↓</button>
            }
          </div>

          <div class="vw-group">
            <button class="tb tb--wide" (click)="close()">{{ 'viewer.close_file' | translate }}</button>
          </div>
        </div>

        <!-- ── Layout: thumbs + pagina ──────────── -->
        <div class="vw-body">
          <aside class="vw-thumbs">
            @for (t of thumbs(); track $index) {
              <button class="vw-thumb" [class.vw-thumb--active]="$index + 1 === pageNum()" (click)="goTo($index + 1)">
                @if (t) { <img [src]="t" alt="p. {{ $index + 1 }}"> } @else { <span class="vw-thumb-ph">{{ $index + 1 }}</span> }
                <small>{{ $index + 1 }}</small>
              </button>
            }
          </aside>
          <main class="vw-main">
            <canvas #page class="vw-canvas"></canvas>
          </main>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cp-page { min-height: 100%; padding: 2rem; background: var(--bg-primary, #0d1117); max-width: 1200px; margin: 0 auto; }
    .cp-header { margin-bottom: 1.75rem; }
    .cp-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary, #e6edf3); margin: 0 0 0.25rem; }
    .cp-subtitle { color: var(--text-secondary, #8b949e); margin: 0; font-size: 0.9rem; }

    .cp-panel {
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; padding: 1.25rem; color: var(--text-primary, #e6edf3);
    }
    .dz {
      border: 2px dashed var(--border-color, #30363d); border-radius: 12px; padding: 2.5rem 1rem;
      text-align: center; cursor: pointer; display: grid; gap: 0.3rem; transition: border-color .18s, background .18s;
    }
    .dz:hover { border-color: var(--accent, #6c63ff); background: rgba(108,99,255,.04); }
    .dz-icon { font-size: 1.75rem; line-height: 1; }
    .dz small { color: var(--text-secondary, #8b949e); }
    .msg { padding: .55rem .8rem; border-radius: 8px; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); font-size: .85rem; color: var(--warning, #fbbf24); margin: 1rem 0 0; }

    .vw-toolbar {
      display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 12px; padding: .5rem .75rem; margin-bottom: .75rem; color: var(--text-primary, #e6edf3);
      position: sticky; top: 0; z-index: 10;
    }
    .vw-group { display: flex; align-items: center; gap: .35rem; }
    .vw-search { margin-left: auto; }
    .tb {
      min-width: 30px; height: 30px; padding: 0 .5rem; border-radius: 8px;
      border: 1px solid var(--border-color, #30363d); background: var(--bg-tertiary, #1c2333);
      color: var(--text-primary, #e6edf3); cursor: pointer; font-size: .9rem;
      display: inline-flex; align-items: center; justify-content: center; font-family: inherit;
    }
    .tb--wide { font-size: .78rem; }
    .tb:hover:not(:disabled) { border-color: var(--accent, #6c63ff); }
    .tb:disabled { opacity: .4; cursor: not-allowed; }
    .vw-pageinfo { font-size: .85rem; color: var(--text-secondary, #8b949e); display: inline-flex; align-items: center; gap: .3rem; }
    .vw-pagein {
      width: 52px; padding: .3rem .4rem; border-radius: 7px; text-align: center;
      border: 1px solid var(--border-color, #30363d); background: var(--bg-primary, #0d1117);
      color: var(--text-primary, #e6edf3); font-family: inherit; font-size: .85rem;
    }
    .vw-zoom { font-size: .8rem; color: var(--text-secondary, #8b949e); min-width: 44px; text-align: center; }
    .vw-searchin {
      width: 180px; padding: .4rem .6rem; border-radius: 8px;
      border: 1px solid var(--border-color, #30363d); background: var(--bg-primary, #0d1117);
      color: var(--text-primary, #e6edf3); font-family: inherit; font-size: .82rem;
    }
    .vw-searchin:focus { outline: none; border-color: var(--accent, #6c63ff); }
    .vw-matches { font-size: .75rem; color: var(--text-secondary, #8b949e); white-space: nowrap; }

    .vw-body { display: flex; gap: .75rem; align-items: flex-start; }
    .vw-thumbs {
      width: 120px; flex-shrink: 0; max-height: 75vh; overflow-y: auto;
      display: flex; flex-direction: column; gap: .5rem; padding: .5rem;
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d); border-radius: 12px;
    }
    .vw-thumb {
      border: 2px solid transparent; border-radius: 8px; padding: 2px; cursor: pointer;
      background: none; display: grid; gap: .15rem; justify-items: center;
    }
    .vw-thumb img { width: 100%; border-radius: 5px; display: block; background: #fff; }
    .vw-thumb-ph {
      width: 100%; aspect-ratio: 3/4; display: grid; place-items: center;
      background: var(--bg-tertiary, #1c2333); border-radius: 5px; color: var(--text-secondary, #8b949e); font-size: .8rem;
    }
    .vw-thumb small { color: var(--text-secondary, #8b949e); font-size: .68rem; }
    .vw-thumb--active { border-color: var(--accent, #6c63ff); }

    .vw-main {
      flex: 1; overflow: auto; max-height: 75vh; text-align: center;
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 12px; padding: 1rem;
    }
    .vw-canvas { max-width: none; box-shadow: 0 4px 24px rgba(0,0,0,.45); border-radius: 4px; background: #fff; }

    @media (max-width: 700px) {
      .cp-page { padding: 1rem; }
      .cp-title { font-size: 1.35rem; }
      .vw-thumbs { display: none; }
      .vw-search { margin-left: 0; }
    }
  `],
})
export class ViewerComponent implements OnInit, OnDestroy {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  private pageRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('page') private set pageCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.pageRef = ref;
    if (ref && this.doc()) void this.renderPage();
  }

  readonly doc = signal<PdfDocument | null>(null);
  readonly pageNum = signal(1);
  readonly numPages = signal(0);
  readonly scale = signal(1);
  readonly thumbs = signal<(string | null)[]>([]);
  readonly msg = signal('');
  readonly query = signal('');
  readonly searching = signal(false);
  readonly matches = signal<SearchMatch[]>([]);
  readonly matchIdx = signal(0);

  readonly zoomPct = computed(() => Math.round(this.scale() * 100));

  private renderToken = 0;

  ngOnInit(): void {
    this.seo.update({
      title: 'Free PDF Viewer Online — Zoom, Search & Thumbnails',
      description: 'View PDF documents in your browser: page navigation, zoom, full-text search and thumbnail preview. Free, private, no upload.',
      url: 'https://gentsallaku.it/dashboard/viewer',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free PDF Viewer',
      description: 'View PDF documents in the browser with page navigation, zoom, full-text search and thumbnail preview.',
      url: 'https://gentsallaku.it/dashboard/viewer',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Page navigation', 'Zoom', 'Full-text search', 'Thumbnail preview', 'Private, no upload'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void { this.close(); }

  select(e: Event): void { void this.open((e.target as HTMLInputElement).files?.[0] ?? null); }
  drop(e: DragEvent): void { e.preventDefault(); void this.open(e.dataTransfer?.files?.[0] ?? null); }

  async open(f: File | null): Promise<void> {
    if (!f) return;
    this.msg.set('');
    try {
      const doc = await this.pdfjs.openDocument(await f.arrayBuffer());
      this.close();
      this.doc.set(doc);
      this.numPages.set(doc.numPages);
      this.pageNum.set(1);
      this.scale.set(1);
      this.query.set('');
      this.matches.set([]);
      this.thumbs.set(new Array(Math.min(doc.numPages, MAX_THUMBS)).fill(null));
      await this.renderPage();
      void this.renderThumbs(doc);
    } catch {
      this.msg.set(`❌ ${this.t.instant('viewer.err_open')}`);
    }
  }

  close(): void {
    const doc = this.doc();
    if (doc) void doc.loadingTask.destroy();
    this.doc.set(null);
    this.thumbs.set([]);
    this.matches.set([]);
    this.query.set('');
    this.renderToken++;
  }

  goTo(n: number): void {
    const clamped = Math.max(1, Math.min(this.numPages(), Math.round(n) || 1));
    if (clamped === this.pageNum()) return;
    this.pageNum.set(clamped);
    void this.renderPage();
  }

  zoomBy(delta: number): void {
    this.scale.set(Math.max(0.5, Math.min(4, Math.round((this.scale() + delta) * 100) / 100)));
    void this.renderPage();
  }

  async fitWidth(): Promise<void> {
    const doc = this.doc();
    const canvas = this.pageRef?.nativeElement;
    if (!doc || !canvas) return;
    const container = canvas.parentElement!;
    const page = await doc.getPage(this.pageNum());
    const naturalWidth = page.getViewport({ scale: 1 }).width;
    const target = (container.clientWidth - 32) / naturalWidth;
    this.scale.set(Math.max(0.5, Math.min(4, Math.round(target * 100) / 100)));
    void this.renderPage();
  }

  async search(q: string): Promise<void> {
    const doc = this.doc();
    this.query.set(q);
    this.matches.set([]);
    this.matchIdx.set(0);
    if (!doc || !q.trim()) { void this.renderPage(); return; }

    this.searching.set(true);
    const needle = q.trim().toLowerCase();
    const found: SearchMatch[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ').toLowerCase();
      let pos = text.indexOf(needle);
      while (pos !== -1) {
        found.push({ page: i });
        pos = text.indexOf(needle, pos + needle.length);
      }
    }
    this.searching.set(false);
    this.matches.set(found);
    if (found.length > 0) {
      this.matchIdx.set(0);
      this.pageNum.set(found[0].page);
    }
    void this.renderPage();
  }

  nextMatch(dir: -1 | 1): void {
    const all = this.matches();
    if (all.length === 0) return;
    const next = (this.matchIdx() + dir + all.length) % all.length;
    this.matchIdx.set(next);
    this.pageNum.set(all[next].page);
    void this.renderPage();
  }

  // ── Rendering ────────────────────────────────────────────────────────

  private async renderPage(): Promise<void> {
    const doc = this.doc();
    const canvas = this.pageRef?.nativeElement;
    if (!doc || !canvas) return;

    const token = ++this.renderToken;
    const page = await doc.getPage(this.pageNum());
    if (token !== this.renderToken) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: this.scale() * dpr });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
    await page.render({ canvas, viewport }).promise;
    if (token !== this.renderToken) return;

    if (this.query().trim()) await this.highlight(page, viewport, canvas);
  }

  /** Evidenzia gli item di testo che contengono la query sulla pagina corrente. */
  private async highlight(
    page: import('pdfjs-dist').PDFPageProxy,
    viewport: import('pdfjs-dist').PageViewport,
    canvas: HTMLCanvasElement,
  ): Promise<void> {
    const needle = this.query().trim().toLowerCase();
    const content = await page.getTextContent();
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(250, 204, 21, .35)';

    for (const item of content.items) {
      if (!('str' in item) || !item.str.toLowerCase().includes(needle)) continue;
      const tx = item.transform;
      const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
      const h = Math.hypot(tx[2], tx[3]) * viewport.scale;
      const w = item.width * viewport.scale;
      ctx.fillRect(x, y - h, w, h * 1.2);
    }
  }

  private async renderThumbs(doc: PdfDocument): Promise<void> {
    const count = Math.min(doc.numPages, MAX_THUMBS);
    for (let i = 1; i <= count; i++) {
      if (this.doc() !== doc) return; // documento chiuso/sostituito
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 110 / page.getViewport({ scale: 1 }).width });
        const c = document.createElement('canvas');
        c.width = Math.ceil(viewport.width);
        c.height = Math.ceil(viewport.height);
        await page.render({ canvas: c, viewport }).promise;
        const url = c.toDataURL('image/jpeg', 0.6);
        this.thumbs.update((arr) => {
          const next = [...arr];
          next[i - 1] = url;
          return next;
        });
      } catch {
        return; // rendering interrotto (es. documento distrutto)
      }
    }
  }
}
