import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef,
  ViewChild, inject, signal, computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';

interface SearchMatch { page: number; }

const MAX_THUMBS = 200;

@Component({
  selector: 'app-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, FileDropzoneDirective, RouterLink],
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss'],
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
  /** true se l'ultima ricerca ha rilevato pochissimo testo estraibile (probabile PDF scansionato) */
  readonly docSparseText = signal(false);

  readonly zoomPct = computed(() => Math.round(this.scale() * 100));
  readonly showOcrHint = computed(() =>
    this.query().trim().length > 0 && !this.searching() && this.matches().length === 0 && this.docSparseText()
  );

  private renderToken = 0;

  ngOnInit(): void {
    this.seo.update({
      title: 'Free PDF Viewer Online — Zoom, Search & Thumbnails',
      description: 'View PDF documents in your browser: page navigation, zoom, full-text search and thumbnail preview. Free, private, no upload.',
      url: 'https://gentsallaku.it/lab/viewer',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free PDF Viewer',
      description: 'View PDF documents in the browser with page navigation, zoom, full-text search and thumbnail preview.',
      url: 'https://gentsallaku.it/lab/viewer',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Page navigation', 'Zoom', 'Full-text search', 'Thumbnail preview', 'Private, no upload'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void { this.close(); }

  select(e: Event): void { void this.open((e.target as HTMLInputElement).files?.[0] ?? null); }
  onFilesDropped(files: FileList): void { void this.open(files[0] ?? null); }

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
      this.docSparseText.set(false);
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
    this.docSparseText.set(false);
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
    let totalChars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const raw = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      totalChars += raw.trim().length;
      const text = raw.toLowerCase();
      let pos = text.indexOf(needle);
      while (pos !== -1) {
        found.push({ page: i });
        pos = text.indexOf(needle, pos + needle.length);
      }
    }
    this.searching.set(false);
    this.matches.set(found);
    // < 15 caratteri/pagina in media ⇒ quasi certamente un PDF scansionato senza layer di testo
    this.docSparseText.set(totalChars / doc.numPages < 15);
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
