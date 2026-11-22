import {
  Component, ChangeDetectionStrategy, OnDestroy, OnInit, PLATFORM_ID, inject, signal, computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import { LabToolInfoComponent } from '../../../shared/components/lab-tool-info/lab-tool-info.component';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import {
  FORMATS, MAX_FILES, MAX_FILE_BYTES, MAX_PIXELS, OutFormat, SIZE_PRESETS, buildZip, computeTargetSize, formatBytes,
  isHeicFile, isImageFile, outputName, savedPercent,
} from './image-tools.utils';

export interface ImageResult {
  id: number;
  source: string;
  name: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  before: number;
  after: number;
  percent: number;
  heic: boolean;
}

interface Queued {
  id: number;
  file: File;
}

@Component({
  selector: 'app-image-tools',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabToolInfoComponent, TranslateModule, FileDropzoneDirective, BreadcrumbComponent],
  templateUrl: './image-tools.component.html',
  styleUrls: ['./image-tools.component.scss'],
})
export class ImageToolsComponent implements OnInit, OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly labInfo = inject(LabInfoService);
  private readonly langService = inject(LanguageService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly page = this.labInfo.page('image-tools');
  breadcrumbItems: BreadcrumbItem[] = [];

  readonly formats: readonly OutFormat[] = ['jpeg', 'png', 'webp'];
  readonly sizePresets = SIZE_PRESETS;

  readonly queue = signal<Queued[]>([]);
  readonly format = signal<OutFormat>('jpeg');
  /** Lato lungo massimo; null = originale */
  readonly maxSide = signal<number | null>(1920);
  readonly quality = signal(0.85);
  readonly lossy = computed(() => FORMATS[this.format()].lossy);
  readonly qualityPct = computed(() => Math.round(this.quality() * 100));

  readonly working = signal(false);
  readonly progress = signal({ done: 0, total: 0 });
  readonly progressPct = computed(() => (this.progress().total ? Math.round((this.progress().done / this.progress().total) * 100) : 0));
  readonly results = signal<ImageResult[]>([]);
  readonly failed = signal<{ name: string; reason: string }[]>([]);
  readonly msg = signal('');
  readonly decodingHeic = signal(false);
  readonly workspaceItem = signal<WorkspaceItem | null>(null);

  readonly totalBefore = computed(() => this.results().reduce((s, r) => s + r.before, 0));
  readonly totalAfter = computed(() => this.results().reduce((s, r) => s + r.after, 0));
  readonly totalPercent = computed(() => savedPercent(this.totalBefore(), this.totalAfter()));
  readonly totalBeforeLabel = computed(() => formatBytes(this.totalBefore()));
  readonly totalAfterLabel = computed(() => formatBytes(this.totalAfter()));

  private nextId = 1;
  private cancelRequested = false;

  ngOnInit(): void {
    // Le pagine per ricerca specifica partono già con le impostazioni giuste: chi arriva da "heic to jpg"
    // non deve toccare nulla, chi cerca "ridimensiona immagine" trova già un lato lungo ragionevole.
    switch (this.page.intent) {
      case 'heic-to-jpg': this.format.set('jpeg'); this.maxSide.set(null); this.quality.set(0.92); break;
      case 'webp-to-jpg': this.format.set('jpeg'); this.maxSide.set(null); this.quality.set(0.92); break;
      case 'jpg-to-webp': this.format.set('webp'); this.maxSide.set(null); this.quality.set(0.85); break;
      case 'resize-image': this.maxSide.set(1280); break;
      case 'compress-image': this.maxSide.set(2048); this.quality.set(0.7); break;
    }
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file' && pending.blob && isImageFile(pending.filename, pending.mime ?? '')) this.workspaceItem.set(pending);

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
        featureList: ['HEIC to JPG', 'Resize images', 'Compress images', 'Remove photo metadata', 'Works in the browser, no upload'],
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
    this.revokeAll();
  }

  // ── Aggiunta file ─────────────────────────────────────────────
  select(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.add(files);
  }

  onFilesDropped(files: FileList): void {
    this.add(Array.from(files));
  }

  useWorkspaceFile(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'file' || !item.blob) return;
    this.add([new File([item.blob], item.filename, { type: item.mime })]);
  }

  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  private add(files: File[]): void {
    if (this.working()) return;
    const images = files.filter((f) => isImageFile(f.name, f.type));
    const skipped = files.length - images.length;
    const tooBig = images.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = images.filter((f) => f.size <= MAX_FILE_BYTES);
    const room = Math.max(0, MAX_FILES - this.queue().length);
    const accepted = ok.slice(0, room);
    const notes: string[] = [];
    if (skipped) notes.push(this.t.instant('image_tools.note_skipped', { count: skipped }));
    if (tooBig.length) notes.push(this.t.instant('image_tools.note_too_big', { count: tooBig.length, max: Math.round(MAX_FILE_BYTES / 1048576) }));
    if (ok.length > room) notes.push(this.t.instant('image_tools.note_limit', { max: MAX_FILES }));
    this.msg.set(notes.join(' '));
    if (accepted.length === 0) return;
    this.queue.update((q) => [...q, ...accepted.map((file) => ({ id: this.nextId++, file }))]);
    this.clearResults();
  }

  removeFromQueue(id: number): void {
    if (this.working()) return;
    this.queue.update((q) => q.filter((x) => x.id !== id));
    this.clearResults();
  }

  clearAll(): void {
    if (this.working()) return;
    this.queue.set([]);
    this.clearResults();
    this.msg.set('');
  }

  // ── Impostazioni ──────────────────────────────────────────────
  setFormat(f: OutFormat): void {
    this.format.set(f);
    this.clearResults();
  }

  setMaxSide(value: string): void {
    this.maxSide.set(value === 'orig' ? null : Number(value));
    this.clearResults();
  }

  setQuality(value: string): void {
    const q = Math.min(1, Math.max(0.3, Number(value) / 100));
    this.quality.set(q);
    this.clearResults();
  }

  sizeValue(side: number | null): string {
    return side === null ? 'orig' : String(side);
  }

  // ── Conversione ───────────────────────────────────────────────
  cancel(): void {
    this.cancelRequested = true;
  }

  async convert(): Promise<void> {
    const items = this.queue();
    if (!items.length || this.working() || !isPlatformBrowser(this.platformId)) return;
    this.working.set(true);
    this.cancelRequested = false;
    this.clearResults();
    this.msg.set('');
    this.progress.set({ done: 0, total: items.length });
    const taken = new Set<string>();
    const fmt = FORMATS[this.format()];
    const results: ImageResult[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      if (this.cancelRequested) break;
      const { file, id } = items[i];
      try {
        const { bitmap, heic } = await this.decode(file);
        const r = await this.encode(bitmap, fmt.mime, this.lossy() ? this.quality() : undefined);
        bitmap.close?.();
        results.push({
          id, source: file.name, name: outputName(file.name, fmt.ext, taken), blob: r.blob, url: URL.createObjectURL(r.blob),
          width: r.width, height: r.height, before: file.size, after: r.blob.size, percent: savedPercent(file.size, r.blob.size), heic,
        });
      } catch (err) {
        failed.push({ name: file.name, reason: err instanceof Error ? err.message : 'error' });
      }
      this.progress.set({ done: i + 1, total: items.length });
      this.results.set([...results]);
      // lascia respirare l'interfaccia tra un'immagine e l'altra
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    this.failed.set(failed);
    this.working.set(false);
    if (this.cancelRequested) this.msg.set(this.t.instant('image_tools.cancelled'));
    else if (!results.length) this.msg.set(this.t.instant('image_tools.err_all_failed'));
    this.analytics.trackClick('image_tools_convert', `${this.format()}:${results.length}`);
  }

  /** Apre l'immagine: HEIC via decodificatore del browser se c'è (Safari), altrimenti con heic2any caricato solo quando serve. */
  private async decode(file: File): Promise<{ bitmap: ImageBitmap; heic: boolean }> {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const heic = isHeicFile(head, file.name, file.type);
    const open = (blob: Blob) => createImageBitmap(blob);
    let bitmap: ImageBitmap;
    if (!heic) {
      bitmap = await open(file);
    } else {
      try {
        bitmap = await open(file);
      } catch {
        this.decodingHeic.set(true);
        try {
          const { default: heic2any } = await import('heic2any');
          const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 1 });
          bitmap = await open(Array.isArray(out) ? out[0] : out);
        } finally {
          this.decodingHeic.set(false);
        }
      }
    }
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      bitmap.close?.();
      throw new Error('too_large');
    }
    return { bitmap, heic };
  }

  private async encode(bitmap: ImageBitmap, mime: string, quality?: number): Promise<{ blob: Blob; width: number; height: number }> {
    const target = computeTargetSize(bitmap.width, bitmap.height, this.maxSide());
    const canvas = this.drawScaled(bitmap, target.width, target.height, mime === 'image/jpeg');
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), mime, quality);
    });
    canvas.width = 0;
    canvas.height = 0;
    return { blob, width: target.width, height: target.height };
  }

  /**
   * Riduce a passi di metà: un salto unico da 4000 px a 800 px con drawImage salta pixel e dà bordi
   * seghettati; dimezzare ripetutamente (come fanno i programmi di fotoritocco) tiene i dettagli puliti.
   */
  private drawScaled(src: ImageBitmap, width: number, height: number, opaque: boolean): HTMLCanvasElement {
    let cur: CanvasImageSource = src;
    let cw = src.width;
    let ch = src.height;
    while (cw / 2 >= width && ch / 2 >= height) {
      const half = document.createElement('canvas');
      half.width = Math.max(1, Math.floor(cw / 2));
      half.height = Math.max(1, Math.floor(ch / 2));
      const hctx = half.getContext('2d')!;
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(cur, 0, 0, half.width, half.height);
      if (cur instanceof HTMLCanvasElement) { cur.width = 0; cur.height = 0; }
      cur = half;
      cw = half.width;
      ch = half.height;
    }
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d')!;
    // JPEG non ha trasparenza: senza fondo bianco le aree trasparenti di un PNG diventerebbero nere
    if (opaque) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, width, height);
    if (cur instanceof HTMLCanvasElement) { cur.width = 0; cur.height = 0; }
    return out;
  }

  // ── Uscita ────────────────────────────────────────────────────
  downloadOne(r: ImageResult): void {
    this.saveBlob(r.blob, r.name);
    this.analytics.trackClick('image_tools_download', 'one');
  }

  async downloadAll(): Promise<void> {
    const list = this.results();
    if (!list.length) return;
    if (list.length === 1) { this.downloadOne(list[0]); return; }
    const entries = await Promise.all(list.map(async (r) => ({ name: r.name, data: new Uint8Array(await r.blob.arrayBuffer()) })));
    const zip = buildZip(entries);
    this.saveBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), 'immagini.zip');
    this.analytics.trackClick('image_tools_download', `zip:${list.length}`);
  }

  sendToWorkspace(r: ImageResult): void {
    this.workspace.send({ kind: 'file', blob: r.blob, filename: r.name, mime: r.blob.type, fromTool: 'image_tools' });
  }

  private saveBlob(blob: Blob, name: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    // Revoca differita: Safari/iOS avvia il download in modo asincrono.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  private clearResults(): void {
    this.revokeAll();
    this.results.set([]);
    this.failed.set([]);
    this.progress.set({ done: 0, total: 0 });
  }

  private revokeAll(): void {
    for (const r of this.results()) URL.revokeObjectURL(r.url);
  }

  fileSizeLabel(f: File): string {
    return formatBytes(f.size);
  }

  readonly fmtBytes = formatBytes;
}
