import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef,
  ViewChild, inject, signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { LibraryService, LibraryAnnotation, LibraryDoc } from '../../../core/services/library.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import {
  toNormRect, quoteFromRect, annotationsToMarkdown, HIGHLIGHT_COLORS, NormRect,
} from './viewer-annotations';

interface SearchMatch { page: number; }

const MAX_THUMBS = 200;

@Component({
  selector: 'app-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, FileDropzoneDirective, RouterLink, FormsModule],
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.scss'],
})
export class ViewerComponent implements OnInit, OnDestroy {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);
  private readonly library = inject(LibraryService);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

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

  // ── Annotazioni ────────────────────────────────────────────────────
  // Vivono nella Libreria, quindi esistono solo per un documento che ne fa
  // parte: un PDF aperto al volo da disco non ha un id a cui legarle.
  readonly libraryDoc = signal<LibraryDoc | null>(null);
  /** Il file attualmente aperto, per poterlo archiviare in Libreria e sbloccare le annotazioni. */
  readonly currentFile = signal<File | null>(null);
  readonly annotations = signal<LibraryAnnotation[]>([]);
  readonly annotateMode = signal(false);
  readonly activeColor = signal<string>(HIGHLIGHT_COLORS[0]);
  readonly colors = HIGHLIGHT_COLORS;
  readonly editingNoteId = signal<string | null>(null);
  readonly noteDraft = signal('');
  readonly dragRect = signal<NormRect | null>(null);

  readonly canAnnotate = computed(() => this.libraryDoc() !== null);
  readonly pageAnnotations = computed(() =>
    this.annotations().filter((a) => a.page === this.pageNum()),
  );

  private dragStart: { x: number; y: number } | null = null;

  /**
   * Testo già estratto per il documento aperto dalla Libreria, letto una
   * volta sola da IndexedDB invece che ri-parsato pagina per pagina a ogni
   * ricerca — su un libro lungo la differenza è secondi vs. istantaneo.
   * null quando il documento non viene dalla Libreria o non è ancora indicizzato:
   * in quel caso search() torna al parsing diretto via pdf.js, come prima.
   */
  private cachedPageTexts: Map<number, string> | null = null;

  private renderToken = 0;

  ngOnInit(): void {
    const docId = this.route.snapshot.queryParamMap.get('doc');
    if (docId) {
      const page = Number(this.route.snapshot.queryParamMap.get('page')) || 1;
      void this.openFromLibrary(docId, page);
    }

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
      this.currentFile.set(f);
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
    this.currentFile.set(null);
    this.libraryDoc.set(null);
    this.annotations.set([]);
    this.annotateMode.set(false);
    this.dragRect.set(null);
    this.dragStart = null;
    this.cachedPageTexts = null;
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

    if (this.cachedPageTexts) {
      // Testo già estratto dalla Libreria: nessun giro su pdf.js per cercare.
      for (const [pageNum, raw] of this.cachedPageTexts) {
        totalChars += raw.trim().length;
        const text = raw.toLowerCase();
        let pos = text.indexOf(needle);
        while (pos !== -1) {
          found.push({ page: pageNum });
          pos = text.indexOf(needle, pos + needle.length);
        }
      }
      found.sort((a, b) => a.page - b.page);
    } else {
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

  // ── Libreria e annotazioni ───────────────────────────────────────────

  /** Apre un documento già archiviato in Libreria, con le sue annotazioni. */
  async openFromLibrary(docId: string, page = 1): Promise<void> {
    await this.library.refresh();
    const meta = this.library.get(docId);
    const blob = await this.library.getBlob(docId);
    if (!meta || !blob) {
      this.msg.set(`❌ ${this.t.instant('viewer.err_load_doc')}`);
      return;
    }

    await this.open(new File([blob], `${meta.title}.pdf`, { type: 'application/pdf' }));
    // open() azzera lo stato del viewer precedente: il legame con la libreria
    // va ristabilito dopo, non prima, o verrebbe cancellato da close().
    // Le annotazioni prima di libraryDoc: è quest'ultimo ad accendere il
    // pannello, che altrimenti apparirebbe un istante come "nessuna nota".
    this.annotations.set(await this.library.annotationsOf(docId));
    if (meta.indexedAt !== null) {
      const pages = await this.library.pagesOf(docId);
      this.cachedPageTexts = new Map(pages.map((p) => [p.page, p.text]));
    }
    this.libraryDoc.set(meta);
    if (page > 1) this.goTo(page);
  }

  /**
   * Archivia in Libreria il PDF aperto da disco, per poterlo annotare.
   * Le annotazioni hanno bisogno di un documento con un id stabile a cui legarsi.
   */
  async saveCurrentToLibrary(): Promise<void> {
    const file = this.currentFile();
    if (!file) return;
    const meta = await this.library.add(
      {
        id: `upload-${file.name}-${file.size}`,
        title: file.name.replace(/\.pdf$/i, ''),
        author: '',
        year: '',
        source: 'upload',
        sourceLabel: this.t.instant('library.source_upload'),
        detailsUrl: '',
        coverUrl: null,
      },
      file,
    );
    this.libraryDoc.set(meta);
    this.annotations.set([]);
  }

  toggleAnnotateMode(): void {
    this.annotateMode.update((on) => !on);
  }

  setColor(color: string): void {
    this.activeColor.set(color);
  }

  // ── Trascinamento sul canvas ──
  // I gestori sono attivi solo in modalità evidenziazione: fuori da quella,
  // il canvas deve restare un normale documento selezionabile e scorrevole.

  onPointerDown(event: PointerEvent): void {
    if (!this.annotateMode() || !this.canAnnotate()) return;
    const canvas = this.pageRef?.nativeElement;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    this.dragStart = this.pointOn(canvas, event);
    this.dragRect.set(null);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragStart) return;
    const canvas = this.pageRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.dragRect.set(
      toNormRect(this.dragStart, this.pointOn(canvas, event), rect.width, rect.height),
    );
  }

  async onPointerUp(event: PointerEvent): Promise<void> {
    const canvas = this.pageRef?.nativeElement;
    const doc = this.doc();
    const libraryDoc = this.libraryDoc();
    const start = this.dragStart;
    this.dragStart = null;
    if (!start || !canvas || !doc || !libraryDoc) return;

    const bounds = canvas.getBoundingClientRect();
    const rect = toNormRect(start, this.pointOn(canvas, event), bounds.width, bounds.height);
    this.dragRect.set(null);
    if (!rect) return;

    const page = await doc.getPage(this.pageNum());
    const quote = await quoteFromRect(page, rect);
    const saved = await this.library.addAnnotation({
      docId: libraryDoc.id,
      page: this.pageNum(),
      rect,
      color: this.activeColor(),
      quote,
      note: '',
    });
    this.annotations.update((list) => [...list, saved]);
  }

  /** Coordinate del puntatore relative al canvas, in pixel CSS. */
  private pointOn(canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // ── Gestione delle annotazioni salvate ──

  startNote(a: LibraryAnnotation): void {
    this.editingNoteId.set(a.id);
    this.noteDraft.set(a.note);
  }

  async saveNote(a: LibraryAnnotation): Promise<void> {
    const note = this.noteDraft();
    await this.library.updateAnnotation(a.id, { note });
    this.annotations.update((list) => list.map((x) => (x.id === a.id ? { ...x, note } : x)));
    this.editingNoteId.set(null);
    this.noteDraft.set('');
  }

  cancelNote(): void {
    this.editingNoteId.set(null);
    this.noteDraft.set('');
  }

  async deleteAnnotation(a: LibraryAnnotation): Promise<void> {
    await this.library.removeAnnotation(a.id);
    this.annotations.update((list) => list.filter((x) => x.id !== a.id));
  }

  goToAnnotation(a: LibraryAnnotation): void {
    this.goTo(a.page);
  }

  /** Manda le note all'editor via Workspace: da lì diventano un articolo o un appunto. */
  exportAnnotations(): void {
    const doc = this.libraryDoc();
    if (!doc || this.annotations().length === 0) return;
    const markdown = annotationsToMarkdown(doc.title, this.annotations());
    this.workspace.send({
      kind: 'text',
      text: markdown,
      filename: `${doc.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'note'}.md`,
      mime: 'text/markdown',
      fromTool: 'viewer',
    });
    void this.router.navigate(['/lab/editor']);
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
