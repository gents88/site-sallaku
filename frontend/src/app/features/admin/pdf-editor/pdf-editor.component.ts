import {
  Component, ChangeDetectionStrategy, HostListener, OnInit, inject, signal, computed,
} from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import { SampleFileButtonComponent } from '../../../shared/components/sample-file-button/sample-file-button.component';
import { LabToolInfoComponent } from '../../../shared/components/lab-tool-info/lab-tool-info.component';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';

/** Quanti passi di annulla si ricordano: bastano per un errore di click, senza tenere in memoria snapshot all'infinito. */
const MAX_UNDO = 30;
/** Le miniature si applicano a gruppi: un update dell'array per ogni pagina rendeva il caricamento O(n²) su PDF lunghi. */
const THUMB_BATCH = 6;

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
  imports: [LabToolInfoComponent, TranslateModule, FileDropzoneDirective, BreadcrumbComponent, SampleFileButtonComponent],
  templateUrl: './pdf-editor.component.html',
  styleUrls: ['./pdf-editor.component.scss'],
})
export class PdfEditorComponent implements OnInit {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly labInfo = inject(LabInfoService);
  private readonly langService = inject(LanguageService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);

  readonly pages = signal<PageEntry[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly watermark = signal('');
  readonly range = signal('');
  readonly dragIndex = signal<number | null>(null);
  readonly dragOverIndex = signal<number | null>(null);
  readonly workspaceItem = signal<WorkspaceItem | null>(null);
  readonly justSent = signal(false);
  readonly moveAnnouncement = signal('');
  readonly exportReady = signal(false);
  breadcrumbItems: BreadcrumbItem[] = [];
  private undoStack: PageEntry[][] = [];
  readonly canUndo = signal(false);
  private lastExportBlob: Blob | null = null;
  private lastExportName = '';

  readonly sourceNames = computed(() => {
    this.pages(); // ricalcola quando cambiano le pagine
    return this.sources.map((s) => s.name).join(' · ');
  });

  private sources: SourcePdf[] = [];
  private nextId = 1;

  ngOnInit(): void {
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file' && pending.blob) {
      this.workspaceItem.set(pending);
    }
    this.seo.update({
      title: this.t.instant('pdf_editor.seo_title'),
      description: this.t.instant('pdf_editor.seo_description'),
      url: `${SITE_ORIGIN}${withLangPrefix('/lab/pdf-editor', this.langService.current())}`,
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['Merge PDFs', 'Split & extract pages', 'Rotate & delete pages', 'Add watermark', 'Client-side, no upload'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
        ...this.labInfo.appFields('pdf-editor'),
      },
      ...this.labInfo.faqSchemas('pdf-editor'),
      this.seo.breadcrumb([
        { name: this.t.instant('nav.home'), url: 'https://gentsallaku.it/' },
        { name: this.t.instant('sidebar.lab'), url: 'https://gentsallaku.it/lab' },
        { name: this.t.instant('sidebar.items.pdf_editor'), url: 'https://gentsallaku.it/lab/pdf-editor' },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: this.t.instant('nav.home'), path: '/' },
      { label: this.t.instant('sidebar.lab'), path: '/lab' },
      { label: this.t.instant('sidebar.items.pdf_editor') },
    ];
  }

  select(e: Event): void {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    void this.addFiles(files);
  }

  onFilesDropped(files: FileList): void {
    void this.addFiles(Array.from(files));
  }

  useWorkspaceFile(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'file' || !item.blob) return;
    const file = new File([item.blob], item.filename, { type: item.mime });
    void this.addFiles([file]);
  }

  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  sendToWorkspace(): void {
    if (!this.lastExportBlob) return;
    this.workspace.send({
      kind: 'file',
      blob: this.lastExportBlob,
      filename: this.lastExportName,
      mime: 'application/pdf',
      fromTool: 'pdf_editor',
    });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }

  /** Salva lo stato corrente prima di una modifica, per poterla annullare. */
  private snapshot(): void {
    this.undoStack.push(this.pages());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.canUndo.set(true);
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    // Le miniature non cambiano con una modifica: si riusano quelle correnti se la pagina esiste ancora.
    const thumbs = new Map(this.pages().map((p) => [p.id, p.thumb]));
    this.pages.set(prev.map((p) => ({ ...p, thumb: p.thumb ?? thumbs.get(p.id) ?? null })));
    this.canUndo.set(this.undoStack.length > 0);
    this.moveAnnouncement.set(this.t.instant('pdf_editor.undone'));
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return; // l'undo nativo dei campi di testo
    if (!this.canUndo()) return;
    e.preventDefault();
    this.undo();
  }

  duplicate(i: number): void {
    this.snapshot();
    this.pages.update((all) => {
      const next = [...all];
      next.splice(i + 1, 0, { ...all[i], id: this.nextId++ });
      return next;
    });
    this.announceMove(i + 1);
  }

  rotate(i: number): void {
    this.snapshot();
    this.pages.update((all) => {
      const next = [...all];
      next[i] = { ...next[i], rot: ((next[i].rot + 90) % 360) as PageEntry['rot'] };
      return next;
    });
  }

  move(i: number, dir: -1 | 1): void {
    this.snapshot();
    this.pages.update((all) => {
      const next = [...all];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
    this.announceMove(i + dir);
  }

  remove(i: number): void {
    this.snapshot();
    this.pages.update((all) => all.filter((_, idx) => idx !== i));
  }

  onDragStart(event: DragEvent, i: number): void {
    this.dragIndex.set(i);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      // richiesto da Firefox per attivare correttamente il drag
      event.dataTransfer.setData('text/plain', String(i));
    }
  }

  onDragOver(event: DragEvent, i: number): void {
    event.preventDefault(); // necessario per consentire il drop
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragIndex() === null || this.dragIndex() === i) return;
    this.dragOverIndex.set(i);
  }

  onDragLeave(i: number): void {
    if (this.dragOverIndex() === i) this.dragOverIndex.set(null);
  }

  onDrop(event: DragEvent, i: number): void {
    event.preventDefault();
    const from = this.dragIndex();
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
    if (from === null || from === i) return;

    this.snapshot();
    this.pages.update((all) => {
      const next = [...all];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    this.announceMove(i);
  }

  onDragEnd(): void {
    this.dragIndex.set(null);
    this.dragOverIndex.set(null);
  }

  reset(): void {
    this.sources = [];
    this.pages.set([]);
    this.undoStack = [];
    this.canUndo.set(false);
    this.watermark.set('');
    this.range.set('');
    this.msg.set('');
    this.lastExportBlob = null;
    this.lastExportName = '';
    this.exportReady.set(false);
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
      // Solo i sorgenti ancora in uso: se hai eliminato tutte le pagine di un file, non serve nemmeno parsarlo.
      const usedSources = [...new Set(selected.map((e) => e.src))];
      const srcDocs = new Map(
        await Promise.all(usedSources.map(async (i) => [i, await PDFDocument.load(this.sources[i].bytes)] as const)),
      );
      const out = await PDFDocument.create();

      for (const entry of selected) {
        const [copied] = await out.copyPages(srcDocs.get(entry.src)!, [entry.page]);
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
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.outputName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.lastExportBlob = blob;
      this.lastExportName = this.outputName();
      this.exportReady.set(true);
      this.msg.set(`✅ ${this.t.instant('pdf_editor.success')}`);
      this.msgOk.set(true);
    } catch {
      this.msg.set(`❌ ${this.t.instant('pdf_editor.err_failed')}`);
    } finally {
      this.exporting.set(false);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private announceMove(newIndex: number): void {
    this.moveAnnouncement.set(this.t.instant('pdf_editor.page_moved', { position: newIndex + 1 }));
  }

  private async addFiles(files: File[]): Promise<void> {
    const pdfs = files.filter((f) => f.type.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
      if (files.length > 0) this.msg.set(`❌ ${this.t.instant('pdf_editor.err_no_valid_pdf')}`);
      return;
    }
    this.loading.set(true);
    this.msg.set('');

    for (const f of pdfs) {
      const srcIdx = this.sources.length;
      let doc: Awaited<ReturnType<PdfjsService['openDocument']>> | null = null;
      let added: PageEntry[] = [];
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        // pdfjs trasferisce (e stacca) il buffer al worker → passare una copia
        doc = await this.pdfjs.openDocument(bytes.slice().buffer);
        this.sources.push({ bytes, name: f.name });
        added = Array.from({ length: doc.numPages }, (_, i) => ({
          id: this.nextId++, src: srcIdx, page: i, rot: 0 as const, thumb: null,
        }));
        this.pages.update((all) => [...all, ...added]);

        let pending = new Map<number, string>();
        const flush = () => {
          if (pending.size === 0) return;
          const batch = pending;
          pending = new Map();
          this.pages.update((all) => all.map((p) => (batch.has(p.id) ? { ...p, thumb: batch.get(p.id)! } : p)));
        };
        for (const entry of added) {
          const page = await doc.getPage(entry.page + 1);
          const viewport = page.getViewport({ scale: 130 / page.getViewport({ scale: 1 }).width });
          const c = document.createElement('canvas');
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          await page.render({ canvas: c, viewport }).promise;
          pending.set(entry.id, c.toDataURL('image/jpeg', 0.6));
          page.cleanup?.();
          if (pending.size >= THUMB_BATCH) {
            flush();
            await new Promise<void>((r) => setTimeout(r, 0)); // lascia respirare UI e scroll
          }
        }
        flush();
      } catch {
        // File illeggibile (o cifrato): si toglie solo lui, senza lasciare pagine fantasma senza sorgente.
        if (this.sources.length > srcIdx) this.sources.length = srcIdx;
        const ids = new Set(added.map((p) => p.id));
        this.pages.update((all) => all.filter((p) => !ids.has(p.id)));
        this.msg.set(`❌ ${this.t.instant('pdf_editor.err_open')}`);
      } finally {
        if (doc) void doc.loadingTask?.destroy?.();
      }
    }
    this.loading.set(false);
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
