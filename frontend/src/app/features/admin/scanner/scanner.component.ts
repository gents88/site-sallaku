import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef,
  ViewChild, inject, signal,
} from '@angular/core';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConversionService } from '../../../core/services/conversion.service';
import { SeoService } from '../../../core/services/seo.service';

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

@Component({
  selector: 'app-scanner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">📷 {{ 'scanner.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'scanner.subtitle' | translate }}</p>
      </header>

      <!-- ── Sorgente ─────────────────────────────── -->
      <section class="cp-panel" [hidden]="editing()">
        <div class="src-actions">
          <button class="btn btn-p" (click)="cameraOn() ? capture() : startCamera()">
            {{ (cameraOn() ? 'scanner.capture' : 'scanner.start_camera') | translate }}
          </button>
          @if (cameraOn()) {
            <button class="btn btn-s" (click)="stopCamera()">{{ 'scanner.stop_camera' | translate }}</button>
          }
          <button class="btn btn-s" (click)="pick.click()">{{ 'scanner.upload_image' | translate }}</button>
          <input #pick type="file" hidden accept=".png,.jpg,.jpeg,.webp" multiple (change)="select($event)">
        </div>

        <video #video class="video" [hidden]="!cameraOn()" autoplay playsinline muted></video>
        @if (camError()) {
          <p class="msg">{{ camError() }}</p>
        }
        @if (!cameraOn() && pages().length === 0) {
          <p class="placeholder">{{ 'scanner.placeholder' | translate }}</p>
        }
      </section>

      <!-- ── Editing: crop + filtri ────────────────── -->
      <section class="cp-panel" [hidden]="!editing()">
        <div class="edit-toolbar">
          <label class="opt">
            <small>{{ 'scanner.filter' | translate }}</small>
            <select class="sel" [value]="filter()" (change)="setFilter($any($event.target).value)">
              <option value="none">{{ 'scanner.filter_none' | translate }}</option>
              <option value="grayscale">{{ 'scanner.filter_grayscale' | translate }}</option>
              <option value="bw">{{ 'scanner.filter_bw' | translate }}</option>
              <option value="enhance">{{ 'scanner.filter_enhance' | translate }}</option>
            </select>
          </label>
          <div class="ac">
            <button class="btn btn-s" (click)="rotate()">⟳ {{ 'scanner.rotate' | translate }}</button>
            <button class="btn btn-s" (click)="resetCrop()">{{ 'scanner.reset_crop' | translate }}</button>
            <button class="btn btn-s" (click)="cancelEdit()">{{ 'scanner.cancel' | translate }}</button>
            <button class="btn btn-p" (click)="addPage()">{{ 'scanner.add_page' | translate }}</button>
          </div>
        </div>
        <p class="hint-line">{{ 'scanner.crop_hint' | translate }}</p>
        <canvas #edit class="edit-canvas"
                (pointerdown)="cropStart($event)"
                (pointermove)="cropMove($event)"
                (pointerup)="cropEnd($event)"></canvas>
      </section>

      <!-- ── Pagine acquisite ──────────────────────── -->
      @if (pages().length > 0) {
        <section class="cp-panel">
          <div class="res-head">
            <h2>{{ 'scanner.pages_title' | translate }} ({{ pages().length }})</h2>
            <div class="ac">
              <button class="btn btn-s" [disabled]="exporting()" (click)="clearPages()">{{ 'scanner.clear' | translate }}</button>
              <button class="btn btn-p" [disabled]="exporting()" (click)="exportPdf()">
                {{ (exporting() ? 'scanner.exporting' : 'scanner.export_pdf') | translate }}
              </button>
            </div>
          </div>
          <div class="pages-grid">
            @for (p of pages(); track p.id; let i = $index) {
              <figure class="page-card">
                <img [src]="p.thumb" alt="page {{ i + 1 }}">
                <figcaption>
                  <span>{{ i + 1 }}</span>
                  <span class="page-btns">
                    <button [disabled]="i === 0" (click)="move(i, -1)" aria-label="move left">←</button>
                    <button [disabled]="i === pages().length - 1" (click)="move(i, 1)" aria-label="move right">→</button>
                    <button (click)="remove(i)" aria-label="delete">🗑</button>
                  </span>
                </figcaption>
              </figure>
            }
          </div>
          @if (exporting()) {
            <div class="progress-wrap">
              <div class="progress-bar"><div class="progress-fill"></div></div>
            </div>
          }
          @if (msg()) {
            <p class="msg" [class.msg--ok]="msgOk()">{{ msg() }}</p>
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

    .src-actions { display: flex; gap: .6rem; flex-wrap: wrap; }
    .video { width: 100%; max-height: 420px; border-radius: 10px; margin-top: 1rem; background: #000; object-fit: contain; }
    .placeholder { color: var(--text-secondary, #8b949e); text-align: center; padding: 2.5rem 1rem; margin: 0; font-size: .9rem; }

    .edit-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .6rem; }
    .opt small { display: block; font-size: 0.72rem; color: var(--text-secondary, #8b949e); margin-bottom: 0.3rem; }
    .sel {
      padding: 0.5rem 0.75rem; border-radius: 9px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-primary, #0d1117); color: var(--text-primary, #e6edf3);
      font-family: inherit; font-size: 0.875rem; min-width: 160px;
    }
    .sel:focus { outline: none; border-color: var(--accent, #6c63ff); }
    .hint-line { font-size: .78rem; color: var(--text-secondary, #8b949e); margin: 0 0 .6rem; }
    .edit-canvas {
      width: 100%; border-radius: 10px; border: 1px solid var(--border-color, #30363d);
      touch-action: none; cursor: crosshair; display: block; background: #000;
    }

    .res-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .res-head h2 { margin: 0; font-size: 1.05rem; }

    .pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: .75rem; }
    .page-card { margin: 0; border: 1px solid var(--border-color, #30363d); border-radius: 10px; overflow: hidden; background: var(--bg-primary, #0d1117); }
    .page-card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; }
    .page-card figcaption { display: flex; align-items: center; justify-content: space-between; padding: .3rem .5rem; font-size: .75rem; color: var(--text-secondary, #8b949e); }
    .page-btns { display: flex; gap: .15rem; }
    .page-btns button {
      background: none; border: none; color: var(--text-secondary, #8b949e); cursor: pointer;
      font-size: .78rem; padding: .1rem .25rem; border-radius: 4px;
    }
    .page-btns button:hover:not(:disabled) { color: var(--text-primary, #e6edf3); background: var(--bg-tertiary, #1c2333); }
    .page-btns button:disabled { opacity: .35; cursor: not-allowed; }

    .ac { display: flex; gap: .6rem; flex-wrap: wrap; }
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
    }
  `],
})
export class ScannerComponent implements OnInit, OnDestroy {
  private readonly conv = inject(ConversionService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('edit', { static: true }) private editRef!: ElementRef<HTMLCanvasElement>;

  readonly cameraOn = signal(false);
  readonly camError = signal('');
  readonly editing = signal(false);
  readonly filter = signal<Filter>('none');
  readonly pages = signal<ScanPage[]>([]);
  readonly exporting = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);

  private stream: MediaStream | null = null;
  private baseCanvas: HTMLCanvasElement | null = null; // immagine di lavoro a piena risoluzione
  private readonly crop = signal<CropRect | null>(null);
  private dragStart: { x: number; y: number } | null = null;
  private nextId = 1;
  private uploadQueue: File[] = [];

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Document Scanner — Camera to PDF Online',
      description: 'Scan documents with your webcam or phone camera, crop and enhance them, and export as PDF. Free, no signup.',
      url: 'https://gentsallaku.it/dashboard/scanner',
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
    } catch {
      this.camError.set(`❌ ${this.t.instant('scanner.err_camera')}`);
    }
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
    if (files.length === 0) return;
    this.uploadQueue = files.slice(1);
    await this.openImageFile(files[0]);
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

  // ── Pagine + export ──────────────────────────────────────────────────

  move(i: number, dir: -1 | 1): void {
    this.pages.update((p) => {
      const next = [...p];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });
  }

  remove(i: number): void {
    this.pages.update((p) => p.filter((_, idx) => idx !== i));
  }

  clearPages(): void {
    this.pages.set([]);
    this.msg.set('');
  }

  exportPdf(): void {
    const pages = this.pages();
    if (pages.length === 0 || this.exporting()) return;
    this.exporting.set(true);
    this.msg.set('');
    this.msgOk.set(false);

    const files = pages.map((p, i) => new File([p.blob], `scan-${i + 1}.jpg`, { type: 'image/jpeg' }));
    this.conv.convertFiles('image-to-pdf', files).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          this.exporting.set(false);
          if (ev.body instanceof Blob) {
            const url = URL.createObjectURL(ev.body);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scan-${new Date().toISOString().slice(0, 10)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            this.msg.set(`✅ ${this.t.instant('scanner.success')}`);
            this.msgOk.set(true);
          } else {
            this.msg.set(`❌ ${this.t.instant('scanner.err_failed')}`);
          }
        }
      },
      error: () => {
        this.exporting.set(false);
        this.msg.set(`❌ ${this.t.instant('scanner.err_failed')}`);
      },
    });
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

  /** Bianco/nero documentale: soglia adattiva sulla luminanza media. */
  private applyThreshold(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    let sum = 0;
    const lum = new Float32Array(d.length / 4);
    for (let i = 0; i < lum.length; i++) {
      const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      lum[i] = l;
      sum += l;
    }
    const threshold = (sum / lum.length) * 0.92;
    for (let i = 0; i < lum.length; i++) {
      const v = lum[i] > threshold ? 255 : 0;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
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
