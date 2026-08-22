import {
  Component, ChangeDetectionStrategy, OnInit, inject, signal, computed,
} from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';

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
  imports: [TranslateModule, FileDropzoneDirective],
  templateUrl: './pdf-editor.component.html',
  styleUrls: ['./pdf-editor.component.scss'],
})
export class PdfEditorComponent implements OnInit {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
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
      title: 'Free PDF Editor — Merge, Split, Rotate & Watermark',
      description: 'Merge PDFs, split and extract pages, rotate or delete pages and add watermarks — entirely in your browser, files never leave your device.',
      url: 'https://gentsallaku.it/lab/pdf-editor',
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Free PDF Editor',
        description: 'Merge, split, extract, rotate, delete pages and add watermarks to PDF files entirely in the browser.',
        url: 'https://gentsallaku.it/lab/pdf-editor',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['Merge PDFs', 'Split & extract pages', 'Rotate & delete pages', 'Add watermark', 'Client-side, no upload'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Can I merge multiple PDFs into one?',
            acceptedAnswer: { '@type': 'Answer', text: "Yes, select multiple files and they'll be merged in the order you arrange them." },
          },
          {
            '@type': 'Question',
            name: 'Can I reorder, rotate or delete individual pages?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, drag pages to reorder them, and rotate or delete any page individually before exporting.' },
          },
          {
            '@type': 'Question',
            name: 'Can I add a watermark to my PDF?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, an optional text watermark can be applied across the document.' },
          },
          {
            '@type': 'Question',
            name: 'Is my PDF uploaded to a server?',
            acceptedAnswer: { '@type': 'Answer', text: 'No — all editing happens client-side in your browser, so your file never leaves your device.' },
          },
        ],
      },
    ]);
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
    this.announceMove(i + dir);
  }

  remove(i: number): void {
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
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.outputName();
      a.click();
      URL.revokeObjectURL(url);
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
