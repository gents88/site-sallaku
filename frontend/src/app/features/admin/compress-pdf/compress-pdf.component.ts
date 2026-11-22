import {
  Component, ChangeDetectionStrategy, OnDestroy, OnInit, PLATFORM_ID, inject, signal, computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PdfjsService, PdfDocument } from '../../../core/services/pdfjs.service';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import { SampleFileButtonComponent } from '../../../shared/components/sample-file-button/sample-file-button.component';
import { LabToolInfoComponent } from '../../../shared/components/lab-tool-info/lab-tool-info.component';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import {
  CompressLevel, CompressMode, LEVELS, MAX_PAGE_PIXELS, RasterPage, buildPdfFromJpegs, formatBytes, isWorthIt,
  looksTextBased, optimizePdf, savedPercent, scaleForDpi,
} from './compress-pdf.utils';

/** Oltre questo numero di pagine la rasterizzazione nel browser diventa troppo lunga e pesante per essere un buon servizio. */
const MAX_PAGES = 400;
/** Pagine su cui si stima se il documento è "di testo": campionarne poche basta e non rallenta l'apertura. */
const TEXT_SAMPLE_PAGES = 12;

export interface CompressResult {
  blob: Blob;
  name: string;
  before: number;
  after: number;
  percent: number;
  worthIt: boolean;
  mode: CompressMode;
}

@Component({
  selector: 'app-compress-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabToolInfoComponent, TranslateModule, FileDropzoneDirective, BreadcrumbComponent, SampleFileButtonComponent],
  templateUrl: './compress-pdf.component.html',
  styleUrls: ['./compress-pdf.component.scss'],
})
export class CompressPdfComponent implements OnInit, OnDestroy {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly labInfo = inject(LabInfoService);
  private readonly langService = inject(LanguageService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly page = this.labInfo.page('compress-pdf');
  breadcrumbItems: BreadcrumbItem[] = [];

  private pdfDoc: PdfDocument | null = null;
  private sourceBytes: Uint8Array | null = null;
  private cancelRequested = false;

  readonly fileName = signal('');
  readonly fileSize = signal(0);
  readonly numPages = signal(0);
  readonly textBased = signal(false);
  readonly opening = signal(false);
  readonly workspaceItem = signal<WorkspaceItem | null>(null);

  readonly mode = signal<CompressMode>('images');
  readonly level = signal<CompressLevel>('medium');
  readonly levels: readonly CompressLevel[] = ['light', 'medium', 'strong'];

  readonly working = signal(false);
  readonly progress = signal({ done: 0, total: 0 });
  readonly progressPct = computed(() => {
    const p = this.progress();
    return p.total ? Math.round((p.done / p.total) * 100) : 0;
  });
  readonly result = signal<CompressResult | null>(null);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly justSent = signal(false);

  readonly sizeLabel = computed(() => formatBytes(this.fileSize()));
  readonly afterBarPct = computed(() => {
    const r = this.result();
    return r && r.before ? Math.max(3, Math.min(100, Math.round((r.after / r.before) * 100))) : 100;
  });
  readonly beforeLabel = computed(() => formatBytes(this.result()?.before ?? 0));
  readonly afterLabel = computed(() => formatBytes(this.result()?.after ?? 0));
  /** Avviso a chi sta per trasformare un documento di testo in immagini */
  readonly showTextWarning = computed(() => this.mode() === 'images' && this.textBased());

  ngOnInit(): void {
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file' && pending.blob) this.workspaceItem.set(pending);

    this.seo.update({
      title: this.t.instant(this.page.titleKey),
      description: this.t.instant(this.page.descriptionKey),
      url: `${SITE_ORIGIN}${withLangPrefix(this.page.path, this.langService.current())}`,
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['Reduce PDF file size', 'Three compression levels', 'Lossless optimisation option', 'Works in the browser, no upload'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
        ...this.labInfo.appFields(this.page.id),
      },
      ...this.labInfo.faqSchemas(this.page.id),
      this.seo.breadcrumb([
        { name: this.t.instant('nav.home'), url: 'https://gentsallaku.it/' },
        { name: this.t.instant('sidebar.lab'), url: 'https://gentsallaku.it/lab' },
        { name: this.t.instant(this.page.labelKey), url: `${SITE_ORIGIN}${withLangPrefix(this.page.path, this.langService.current())}` },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: this.t.instant('nav.home'), path: '/' },
      { label: this.t.instant('sidebar.lab'), path: '/lab' },
      { label: this.t.instant(this.page.labelKey) },
    ];
  }

  ngOnDestroy(): void {
    this.cancelRequested = true;
    void this.pdfDoc?.loadingTask?.destroy?.();
  }

  // ── Apertura ──────────────────────────────────────────────────
  select(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    void this.open(file);
  }

  onFilesDropped(files: FileList): void {
    void this.open(files[0] ?? null);
  }

  useWorkspaceFile(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'file' || !item.blob) return;
    void this.open(new File([item.blob], item.filename, { type: item.mime }));
  }

  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  async open(file: File | null): Promise<void> {
    if (!file) return;
    if (!(file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf'))) { this.fail('compress_pdf.err_not_pdf'); return; }
    this.opening.set(true);
    this.msg.set('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await this.pdfjs.openDocument(bytes.slice().buffer);
      if (doc.numPages > MAX_PAGES) {
        void doc.loadingTask?.destroy?.();
        this.fail('compress_pdf.err_too_many_pages');
        return;
      }
      void this.pdfDoc?.loadingTask?.destroy?.();
      this.pdfDoc = doc;
      this.sourceBytes = bytes;
      this.fileName.set(file.name);
      this.fileSize.set(file.size);
      this.numPages.set(doc.numPages);
      this.result.set(null);
      this.textBased.set(looksTextBased(await this.sampleTextLengths(doc)));
    } catch {
      this.fail('compress_pdf.err_open');
    } finally {
      this.opening.set(false);
    }
  }

  private async sampleTextLengths(doc: PdfDocument): Promise<number[]> {
    const n = Math.min(doc.numPages, TEXT_SAMPLE_PAGES);
    // pagine distribuite su tutto il documento, non solo le prime (la copertina spesso è un'immagine)
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const pageNo = n === 1 ? 1 : 1 + Math.round((i * (doc.numPages - 1)) / (n - 1));
      try {
        const page = await doc.getPage(pageNo);
        const content = await page.getTextContent();
        out.push(content.items.reduce((sum, it) => sum + ('str' in it ? it.str.length : 0), 0));
        page.cleanup?.();
      } catch { out.push(0); }
    }
    return out;
  }

  closeFile(): void {
    this.cancelRequested = true;
    void this.pdfDoc?.loadingTask?.destroy?.();
    this.pdfDoc = null;
    this.sourceBytes = null;
    this.fileName.set('');
    this.fileSize.set(0);
    this.numPages.set(0);
    this.textBased.set(false);
    this.result.set(null);
    this.working.set(false);
    this.msg.set('');
  }

  private fail(key: string): void {
    this.msg.set(`❌ ${this.t.instant(key)}`);
    this.msgOk.set(false);
  }

  // ── Impostazioni ──────────────────────────────────────────────
  setMode(mode: CompressMode): void {
    this.mode.set(mode);
    this.result.set(null);
  }

  setLevel(level: CompressLevel): void {
    this.level.set(level);
    this.result.set(null);
  }

  levelSpec(level: CompressLevel): { dpi: number } {
    return { dpi: LEVELS[level].dpi };
  }

  // ── Compressione ──────────────────────────────────────────────
  cancel(): void {
    this.cancelRequested = true;
  }

  async compress(): Promise<void> {
    const bytes = this.sourceBytes;
    const doc = this.pdfDoc;
    if (!bytes || !doc || this.working()) return;
    this.working.set(true);
    this.cancelRequested = false;
    this.result.set(null);
    this.msg.set('');
    this.progress.set({ done: 0, total: this.mode() === 'images' ? doc.numPages : 1 });
    const mode = this.mode();
    try {
      let out: Uint8Array | null;
      if (mode === 'keep-text') {
        out = await optimizePdf(bytes);
        this.progress.set({ done: 1, total: 1 });
      } else {
        out = await this.rasterise(doc);
      }
      if (!out) { this.msg.set(this.t.instant('compress_pdf.cancelled')); this.msgOk.set(false); return; }

      const before = bytes.length;
      const baseName = this.fileName().replace(/\.pdf$/i, '') || 'document';
      const result: CompressResult = {
        blob: new Blob([out as BlobPart], { type: 'application/pdf' }),
        name: `${baseName}-compresso.pdf`,
        before,
        after: out.length,
        percent: savedPercent(before, out.length),
        worthIt: isWorthIt(before, out.length),
        mode,
      };
      this.result.set(result);
      this.analytics.trackClick('compress_pdf_done', `${mode}:${mode === 'images' ? this.level() : 'lossless'}:${result.percent}`);
    } catch {
      this.fail('compress_pdf.err_compress');
    } finally {
      this.working.set(false);
    }
  }

  private async rasterise(doc: PdfDocument): Promise<Uint8Array | null> {
    const spec = LEVELS[this.level()];
    const pages: RasterPage[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      if (this.cancelRequested) return null;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const r = await this.pdfjs.renderPageToJpeg(page, scaleForDpi(spec.dpi), spec.quality, { maxPixels: MAX_PAGE_PIXELS });
      page.cleanup?.();
      pages.push({ bytes: r.bytes, width: r.width, height: r.height, pageWidth: base.width, pageHeight: base.height });
      this.progress.set({ done: i, total: doc.numPages });
      // lascia respirare l'interfaccia: il pulsante Annulla e la barra devono restare vivi
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (this.cancelRequested) return null;
    return buildPdfFromJpegs(pages);
  }

  // ── Uscita ────────────────────────────────────────────────────
  download(): void {
    const r = this.result();
    if (!r || !isPlatformBrowser(this.platformId)) return;
    const url = URL.createObjectURL(r.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.name;
    a.click();
    // Revoca differita: Safari/iOS avvia il download in modo asincrono.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.analytics.trackClick('compress_pdf_download', r.worthIt ? 'saved' : 'anyway');
  }

  sendToWorkspace(): void {
    const r = this.result();
    if (!r) return;
    this.workspace.send({ kind: 'file', blob: r.blob, filename: r.name, mime: 'application/pdf', fromTool: 'compress_pdf' });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }
}
