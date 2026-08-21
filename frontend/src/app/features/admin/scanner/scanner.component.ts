import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef,
  ViewChild, afterNextRender, inject, signal,
} from '@angular/core';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConversionService } from '../../../core/services/conversion.service';
import { SeoService } from '../../../core/services/seo.service';
import { OcrService, OcrResult, OCR_LANGUAGES } from '../../../core/services/ocr.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';

type Filter = 'none' | 'grayscale' | 'bw' | 'enhance';

interface ScanPage {
  id: number;
  thumb: string;   // dataURL per l'anteprima
  blob: Blob;      // JPEG a piena risoluzione per l'export
}

interface CropRect { x: number; y: number; w: number; h: number; }

const PREVIEW_FILTERS: Record<Filter, string> = {
  none: 'none',
  grayscale: 'grayscale(1)',
  bw: 'grayscale(1) contrast(2.2) brightness(1.05)',
  enhance: 'contrast(1.25) brightness(1.08) saturate(1.1)',
};

const OCR_LANG_STORAGE_KEY = 'ocr-lang';
const UI_TO_OCR_LANG: Record<string, string> = {
  it: 'ita', en: 'eng', es: 'spa', fr: 'fra', de: 'deu', pt: 'por', sq: 'sqi',
};

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** Allineato al limite lato server per l'export (image.converter.ts: MAX_IMAGE_BYTES). */
const MAX_IMAGE_MB = 20;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
/** Allineato al limite lato server per l'export (conversion.controller.ts: MAX_FILE_COUNT). */
const MAX_PAGES = 20;
/** Passo di spostamento/ridimensionamento del ritaglio da tastiera, in pixel immagine. */
const CROP_KEY_STEP = 16;
const CROP_KEY_STEP_FINE = 4;

@Component({
  selector: 'app-scanner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, FileDropzoneDirective],
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.scss'],
})
export class ScannerComponent implements OnInit, OnDestroy {
  private readonly conv = inject(ConversionService);
  private readonly ocr = inject(OcrService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);

  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('edit', { static: true }) private editRef!: ElementRef<HTMLCanvasElement>;

  readonly cameraOn = signal(false);
  readonly camError = signal('');
  readonly editing = signal(false);
  readonly filter = signal<Filter>('none');
  readonly pages = signal<ScanPage[]>([]);
  readonly exporting = signal(false);
  /** Percentuale reale di upload durante l'export (0-100), null quando non applicabile (es. in attesa della risposta del server). */
  readonly exportPct = signal<number | null>(null);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly limitsHint = { size: MAX_IMAGE_MB, max: MAX_PAGES };
  /** Ultimo PDF esportato con successo (per l'invio a Workspace), invalidato quando le pagine cambiano. */
  readonly lastPdf = signal<{ blob: Blob; filename: string } | null>(null);
  readonly pdfSent = signal(false);
  readonly ocrSent = signal(false);

  readonly ocrLanguages = OCR_LANGUAGES;
  // Deterministic fallback only — see the matching comment in ocr.component.ts.
  // The real saved preference is applied after hydration, in the constructor.
  readonly ocrLang = signal(UI_TO_OCR_LANG[this.t.currentLang] ?? 'eng');
  readonly ocrBusy = signal(false);
  readonly ocrResult = signal<OcrResult | null>(null);
  readonly ocrMsg = signal('');
  readonly ocrMsgOk = signal(false);
  readonly ocrCopied = signal(false);

  private stream: MediaStream | null = null;
  private baseCanvas: HTMLCanvasElement | null = null; // immagine di lavoro a piena risoluzione
  private readonly crop = signal<CropRect | null>(null);
  private dragStart: { x: number; y: number } | null = null;
  private nextId = 1;
  private uploadQueue: File[] = [];

  constructor() {
    afterNextRender(() => this.ocrLang.set(this.defaultOcrLang()));
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Document Scanner — Camera to PDF Online',
      description: 'Scan documents with your webcam or phone camera, crop and enhance them, and export as PDF. Free, no signup.',
      url: 'https://gentsallaku.it/lab/scanner',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free Document Scanner',
      description: 'Scan documents with a webcam or phone camera, crop and enhance them, and export as PDF.',
      url: 'https://gentsallaku.it/lab/scanner',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Camera capture', 'Auto crop & enhance', 'Multi-page scan', 'Export as PDF'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void { this.stopCamera(); }

  // ── Camera ───────────────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    this.camError.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      this.videoRef.nativeElement.srcObject = this.stream;
      this.cameraOn.set(true);
    } catch (err) {
      this.camError.set(`❌ ${this.t.instant(this.cameraErrorKey(err))}`);
    }
  }

  private cameraErrorKey(err: unknown): string {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'scanner.err_camera_denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'scanner.err_camera_notfound';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'scanner.err_camera_inuse';
    return 'scanner.err_camera';
  }

  stopCamera(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.videoRef?.nativeElement) this.videoRef.nativeElement.srcObject = null;
    this.cameraOn.set(false);
  }

  capture(): void {
    const video = this.videoRef.nativeElement;
    if (!video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    this.stopCamera();
    this.openEditor(c);
  }

  async select(e: Event): Promise<void> {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    (e.target as HTMLInputElement).value = '';
    await this.addFiles(files);
  }

  async onFilesDropped(files: FileList): Promise<void> {
    await this.addFiles(Array.from(files));
  }

  private async addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_PAGES - this.pages().length - this.uploadQueue.length);
    const toProcess = files.slice(0, remainingSlots);
    const truncated = files.length > remainingSlots;

    const accepted: File[] = [];
    const errors: string[] = [];
    for (const f of toProcess) {
      const errKey = this.validateFile(f);
      if (errKey) {
        errors.push(this.t.instant(errKey, { max: MAX_IMAGE_MB, name: f.name }));
      } else {
        accepted.push(f);
      }
    }
    if (truncated) errors.push(this.t.instant('scanner.err_too_many_pages', { max: MAX_PAGES }));
    if (errors.length > 0) this.msg.set(`❌ ${errors.join(' ')}`);

    if (accepted.length === 0) return;
    this.uploadQueue.push(...accepted.slice(1));
    await this.openImageFile(accepted[0]);
  }

  private validateFile(f: File): string | null {
    const isAcceptedType = ACCEPTED_IMAGE_TYPES.includes(f.type)
      || /\.(png|jpe?g|webp)$/i.test(f.name);
    if (!isAcceptedType) return 'scanner.err_file_type';
    if (f.size > MAX_IMAGE_BYTES) return 'scanner.err_file_too_large';
    return null;
  }

  // ── Editor (crop + filtri) ───────────────────────────────────────────

  setFilter(f: Filter): void {
    this.filter.set(f);
    this.redraw();
  }

  rotate(): void {
    if (!this.baseCanvas) return;
    const src = this.baseCanvas;
    const dst = document.createElement('canvas');
    dst.width = src.height;
    dst.height = src.width;
    const ctx = dst.getContext('2d')!;
    ctx.translate(dst.width / 2, dst.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    this.baseCanvas = dst;
    this.crop.set(null);
    this.syncEditCanvas();
  }

  resetCrop(): void {
    this.crop.set(null);
    this.redraw();
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.baseCanvas = null;
    this.crop.set(null);
    this.processUploadQueue();
  }

  async addPage(): Promise<void> {
    if (!this.baseCanvas) return;
    const out = this.renderOutput();
    const blob = await new Promise<Blob>((resolve, reject) =>
      out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
    );
    const thumb = this.makeThumb(out);
    this.pages.update((p) => [...p, { id: this.nextId++, thumb, blob }]);
    this.msg.set('');
    this.resetOcrState();
    this.lastPdf.set(null);
    this.editing.set(false);
    this.baseCanvas = null;
    this.crop.set(null);
    this.processUploadQueue();
  }

  cropStart(e: PointerEvent): void {
    const pos = this.canvasPos(e);
    this.dragStart = pos;
    this.crop.set({ x: pos.x, y: pos.y, w: 0, h: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  cropMove(e: PointerEvent): void {
    if (!this.dragStart) return;
    const pos = this.canvasPos(e);
    const s = this.dragStart;
    this.crop.set({
      x: Math.min(s.x, pos.x),
      y: Math.min(s.y, pos.y),
      w: Math.abs(pos.x - s.x),
      h: Math.abs(pos.y - s.y),
    });
    this.redraw();
  }

  cropEnd(e: PointerEvent): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    const c = this.crop();
    // Selezioni troppo piccole = click accidentale → annulla il crop
    if (c && (c.w < 24 || c.h < 24)) this.crop.set(null);
    this.redraw();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }

  /** Alternativa da tastiera al crop col mouse: Invio avvia una selezione centrata, le frecce la spostano, Maiusc+frecce la ridimensionano, Esc la annulla. */
  cropKeydown(e: KeyboardEvent): void {
    if (!this.baseCanvas) return;
    const canvas = this.editRef.nativeElement;
    const step = e.shiftKey || e.altKey ? CROP_KEY_STEP_FINE : CROP_KEY_STEP;
    let c = this.crop();

    if (!c) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const w = Math.round(canvas.width * 0.8);
      const h = Math.round(canvas.height * 0.8);
      this.crop.set({ x: Math.round((canvas.width - w) / 2), y: Math.round((canvas.height - h) / 2), w, h });
      this.redraw();
      return;
    }

    const resize = e.shiftKey;
    switch (e.key) {
      case 'ArrowLeft':
        c = resize
          ? { ...c, w: Math.max(24, c.w - step) }
          : { ...c, x: Math.max(0, c.x - step) };
        break;
      case 'ArrowRight':
        c = resize
          ? { ...c, w: Math.min(canvas.width - c.x, c.w + step) }
          : { ...c, x: Math.min(canvas.width - c.w, c.x + step) };
        break;
      case 'ArrowUp':
        c = resize
          ? { ...c, h: Math.max(24, c.h - step) }
          : { ...c, y: Math.max(0, c.y - step) };
        break;
      case 'ArrowDown':
        c = resize
          ? { ...c, h: Math.min(canvas.height - c.y, c.h + step) }
          : { ...c, y: Math.min(canvas.height - c.h, c.y + step) };
        break;
      case 'Escape':
        this.crop.set(null);
        this.redraw();
        return;
      default:
        return;
    }
    e.preventDefault();
    this.crop.set(c);
    this.redraw();
  }

  // ── Pagine + export ──────────────────────────────────────────────────

  move(i: number, dir: -1 | 1): void {
    this.pages.update((p) => {
      const next = [...p];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
    this.resetOcrState();
    this.lastPdf.set(null);
  }

  remove(i: number): void {
    if (!confirm(this.t.instant('scanner.confirm_delete_page', { n: i + 1 }))) return;
    this.pages.update((p) => p.filter((_, idx) => idx !== i));
    this.resetOcrState();
    this.lastPdf.set(null);
  }

  clearPages(): void {
    if (!confirm(this.t.instant('scanner.confirm_clear', { count: this.pages().length }))) return;
    this.pages.set([]);
    this.msg.set('');
    this.resetOcrState();
    this.lastPdf.set(null);
  }

  exportPdf(): void {
    const pages = this.pages();
    if (pages.length === 0 || this.exporting()) return;
    if (!navigator.onLine) {
      this.msg.set(`❌ ${this.t.instant('scanner.err_offline')}`);
      return;
    }
    this.exporting.set(true);
    this.exportPct.set(0);
    this.msg.set('');
    this.msgOk.set(false);

    const files = pages.map((p, i) => new File([p.blob], `scan-${i + 1}.jpg`, { type: 'image/jpeg' }));
    this.conv.convertFiles('image-to-pdf', files).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) {
          this.exportPct.set(Math.round((ev.loaded / ev.total) * 100));
        } else if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          this.exporting.set(false);
          this.exportPct.set(null);
          if (ev.body instanceof Blob) {
            const filename = `scan-${new Date().toISOString().slice(0, 10)}.pdf`;
            const url = URL.createObjectURL(ev.body);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            this.lastPdf.set({ blob: ev.body, filename });
            this.msg.set(`✅ ${this.t.instant('scanner.success')}`);
            this.msgOk.set(true);
          } else {
            this.msg.set(`❌ ${this.t.instant('scanner.err_failed')}`);
          }
        }
      },
      error: () => {
        this.exporting.set(false);
        this.exportPct.set(null);
        this.msg.set(`❌ ${this.t.instant(navigator.onLine ? 'scanner.err_failed' : 'scanner.err_offline')}`);
      },
    });
  }

  // ── OCR ──────────────────────────────────────────────────────────────

  onOcrLangChange(code: string): void {
    this.ocrLang.set(code);
    try { localStorage.setItem(OCR_LANG_STORAGE_KEY, code); } catch { /* storage unavailable */ }
  }

  /** Esegue l'OCR sulle pagine acquisite (già ritagliate/filtrate) senza produrre un PDF con testo incorporato. */
  runOcr(): void {
    const pages = this.pages();
    if (pages.length === 0 || this.ocrBusy()) return;
    this.ocrBusy.set(true);
    this.ocrMsg.set('');
    this.ocrMsgOk.set(false);
    this.ocrResult.set(null);
    this.ocrCopied.set(false);

    const images = pages.map((p, i) => ({ blob: p.blob, name: `scan-${i + 1}.jpg` }));
    this.ocr.extract(images, this.ocrLang()).subscribe({
      next: (res) => {
        this.ocrBusy.set(false);
        this.ocrResult.set(res);
        this.ocrMsg.set(`✅ ${this.t.instant('ocr.success')}`);
        this.ocrMsgOk.set(true);
      },
      error: (err) => {
        this.ocrBusy.set(false);
        this.ocrMsg.set(`❌ ${this.ocrErrText(err)}`);
      },
    });
  }

  sendPdfToWorkspace(): void {
    const pdf = this.lastPdf();
    if (!pdf) return;
    this.workspace.send({ kind: 'file', blob: pdf.blob, filename: pdf.filename, mime: 'application/pdf', fromTool: 'scanner' });
    this.pdfSent.set(true);
    setTimeout(() => this.pdfSent.set(false), 1500);
  }

  sendOcrToWorkspace(): void {
    const res = this.ocrResult();
    if (!res) return;
    this.workspace.send({ kind: 'text', text: res.text, filename: `scan-${new Date().toISOString().slice(0, 10)}.txt`, fromTool: 'scanner' });
    this.ocrSent.set(true);
    setTimeout(() => this.ocrSent.set(false), 1500);
  }

  copyOcrText(): void {
    const text = this.ocrResult()?.text ?? '';
    navigator.clipboard.writeText(text).then(() => {
      this.ocrCopied.set(true);
      setTimeout(() => this.ocrCopied.set(false), 2000);
    });
  }

  downloadOcrTxt(): void {
    const text = this.ocrResult()?.text ?? '';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private resetOcrState(): void {
    this.ocrResult.set(null);
    this.ocrMsg.set('');
  }

  private defaultOcrLang(): string {
    try {
      const saved = localStorage.getItem(OCR_LANG_STORAGE_KEY);
      if (saved && OCR_LANGUAGES.some((l) => l.code === saved)) return saved;
    } catch { /* storage unavailable */ }
    return UI_TO_OCR_LANG[this.t.currentLang] ?? 'eng';
  }

  private ocrErrText(err: unknown): string {
    const e = err as { status?: number; error?: { message?: string | string[] } };
    if (e?.status === 429) return this.t.instant('ocr.err_rate_limit');
    if (e?.status === 413) return this.t.instant('ocr.err_too_large');
    const detail = e?.error?.message;
    if (Array.isArray(detail)) return detail.join('; ');
    if (typeof detail === 'string') return detail;
    return this.t.instant('ocr.err_failed');
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async openImageFile(f: File): Promise<void> {
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0);
      this.openEditor(c);
    } catch {
      this.msg.set(`❌ ${this.t.instant('scanner.err_failed')}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private processUploadQueue(): void {
    const next = this.uploadQueue.shift();
    if (next) void this.openImageFile(next);
  }

  private openEditor(base: HTMLCanvasElement): void {
    this.baseCanvas = base;
    this.crop.set(null);
    this.filter.set('none');
    this.editing.set(true);
    this.syncEditCanvas();
  }

  private syncEditCanvas(): void {
    if (!this.baseCanvas) return;
    const canvas = this.editRef.nativeElement;
    canvas.width = this.baseCanvas.width;
    canvas.height = this.baseCanvas.height;
    this.redraw();
  }

  private redraw(): void {
    if (!this.baseCanvas) return;
    const canvas = this.editRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.filter = PREVIEW_FILTERS[this.filter()];
    ctx.drawImage(this.baseCanvas, 0, 0);
    ctx.restore();

    const c = this.crop();
    if (c && c.w > 0 && c.h > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#6c63ff';
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.restore();
    }
  }

  private canvasPos(e: PointerEvent): { x: number; y: number } {
    const canvas = this.editRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY)),
    };
  }

  /** Applica crop + filtro reale (threshold incluso) alla risoluzione originale. */
  private renderOutput(): HTMLCanvasElement {
    const base = this.baseCanvas!;
    const c = this.crop() ?? { x: 0, y: 0, w: base.width, h: base.height };
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(c.w));
    out.height = Math.max(1, Math.round(c.h));
    const ctx = out.getContext('2d')!;

    const f = this.filter();
    if (f === 'grayscale' || f === 'enhance') ctx.filter = PREVIEW_FILTERS[f];
    ctx.drawImage(base, c.x, c.y, c.w, c.h, 0, 0, out.width, out.height);
    ctx.filter = 'none';

    if (f === 'bw') this.applyThreshold(out);
    return out;
  }

  /**
   * Bianco/nero documentale con soglia locale adattiva.
   * Una soglia globale unica fallisce su foto con illuminazione irregolare (es. un'ombra
   * che copre parte del foglio): la zona in ombra colava tutta a nero o perdeva i dettagli.
   * Qui l'immagine è divisa in una griglia di blocchi; per ogni pixel la soglia è ottenuta
   * interpolando (bilineare) le medie di luminanza dei blocchi vicini, così ogni zona del
   * documento viene sogliata rispetto alla propria illuminazione locale. Costo O(n): un
   * passaggio per accumulare le medie a blocchi, uno per sogliare — nessuna ricerca di vicini
   * per pixel.
   */
  private applyThreshold(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const w = canvas.width;
    const h = canvas.height;
    const n = w * h;

    // Luminanza per pixel (un solo passaggio, riusata sia per l'accumulo a blocchi sia per la soglia finale).
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }

    // Griglia di blocchi: ~1 blocco ogni 40px, con un minimo di 4 e un massimo di 32 per lato.
    const cols = Math.max(4, Math.min(32, Math.round(w / 40)));
    const rows = Math.max(4, Math.min(32, Math.round(h / 40)));
    const blockW = Math.ceil(w / cols);
    const blockH = Math.ceil(h / rows);

    const blockSum = new Float64Array(cols * rows);
    const blockCount = new Int32Array(cols * rows);
    for (let y = 0; y < h; y++) {
      const by = Math.min(rows - 1, (y / blockH) | 0);
      const rowOff = y * w;
      for (let x = 0; x < w; x++) {
        const bx = Math.min(cols - 1, (x / blockW) | 0);
        const bi = by * cols + bx;
        blockSum[bi] += lum[rowOff + x];
        blockCount[bi]++;
      }
    }
    const blockMean = new Float32Array(cols * rows);
    for (let i = 0; i < blockMean.length; i++) {
      blockMean[i] = blockCount[i] ? blockSum[i] / blockCount[i] : 255;
    }

    // Bias: soglia leggermente sotto la media locale per non perdere tratti sottili di testo.
    const bias = 0.9;

    for (let y = 0; y < h; y++) {
      // Coordinata di blocco frazionaria (centrata sui centri dei blocchi) per l'interpolazione bilineare.
      const fy = y / blockH - 0.5;
      const by0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
      const by1 = Math.min(rows - 1, by0 + 1);
      const ty = Math.min(1, Math.max(0, fy - by0));
      const rowOff = y * w;

      for (let x = 0; x < w; x++) {
        const fx = x / blockW - 0.5;
        const bx0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
        const bx1 = Math.min(cols - 1, bx0 + 1);
        const tx = Math.min(1, Math.max(0, fx - bx0));

        const m00 = blockMean[by0 * cols + bx0];
        const m10 = blockMean[by0 * cols + bx1];
        const m01 = blockMean[by1 * cols + bx0];
        const m11 = blockMean[by1 * cols + bx1];
        const mTop = m00 + (m10 - m00) * tx;
        const mBot = m01 + (m11 - m01) * tx;
        const localThreshold = (mTop + (mBot - mTop) * ty) * bias;

        const idx = rowOff + x;
        const v = lum[idx] > localThreshold ? 255 : 0;
        const di = idx * 4;
        d[di] = d[di + 1] = d[di + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  private makeThumb(src: HTMLCanvasElement): string {
    const maxW = 240;
    const scale = Math.min(1, maxW / src.width);
    const t = document.createElement('canvas');
    t.width = Math.round(src.width * scale);
    t.height = Math.round(src.height * scale);
    t.getContext('2d')!.drawImage(src, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
  }
}
