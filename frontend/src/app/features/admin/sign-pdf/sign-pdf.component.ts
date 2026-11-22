import {
  Component, ChangeDetectionStrategy, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID, ViewChild,
  effect, inject, signal, computed,
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
  FieldKind, PlacedField, clamp01, clampField, exportSignedPdf, formatToday, whiteToTransparent,
} from './sign-pdf.utils';

const SIGNATURE_KEY = 'sign-pdf-signature';
const MAX_UNDO = 30;
/** Area massima (px) della pagina rasterizzata: oltre, i canvas mobile restituiscono bianco. */
const MAX_PAGE_PIXELS = 8_000_000;
const INK_BLACK = '#111827';
const INK_BLUE = '#1d4ed8';
const DEFAULT_FS = 0.022;
const MIN_FS = 0.008;
const MAX_FS = 0.08;
/** Larghezza di partenza di una firma, come frazione della pagina */
const SIGNATURE_W = 0.28;
const MARK_W = 0.045;
const PAD_W = 640;
const PAD_H = 240;
/** Tre "calligrafie" con font di sistema: nessun download di font, e il risultato resta una vera immagine. */
const SIGNATURE_FONTS = [
  'italic 700 76px "Brush Script MT", "Segoe Script", "Snell Roundhand", "Apple Chancery", cursive',
  'italic 400 68px "Lucida Handwriting", "Bradley Hand", "Segoe Script", cursive',
  'italic 400 70px "Palatino Linotype", Georgia, "Times New Roman", serif',
] as const;

type PadTab = 'draw' | 'type' | 'upload';
type DragMode = 'move' | 'resize';

interface DragState {
  id: number;
  mode: DragMode;
  startX: number;
  startY: number;
  orig: PlacedField;
  pointerId: number;
  moved: boolean;
}

@Component({
  selector: 'app-sign-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabToolInfoComponent, TranslateModule, FileDropzoneDirective, BreadcrumbComponent, SampleFileButtonComponent],
  templateUrl: './sign-pdf.component.html',
  styleUrls: ['./sign-pdf.component.scss'],
})
export class SignPdfComponent implements OnInit, OnDestroy {
  private readonly pdfjs = inject(PdfjsService);
  private readonly seo = inject(SeoService);
  private readonly labInfo = inject(LabInfoService);
  private readonly langService = inject(LanguageService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly page = this.labInfo.page('sign-pdf');
  breadcrumbItems: BreadcrumbItem[] = [];

  // ── Documento ─────────────────────────────────────────────────
  private pdfDoc: PdfDocument | null = null;
  private sourceBytes: Uint8Array | null = null;
  readonly fileName = signal('');
  readonly numPages = signal(0);
  readonly pageNum = signal(1);
  readonly pageUrl = signal<string | null>(null);
  /** Altezza / larghezza della pagina vista (A4 ≈ 1,414) */
  readonly aspect = signal(1.414);
  readonly loading = signal(false);
  readonly rendering = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly workspaceItem = signal<WorkspaceItem | null>(null);
  private renderToken = 0;
  private pageObjectUrl: string | null = null;

  // ── Campi sulla pagina ────────────────────────────────────────
  readonly fields = signal<PlacedField[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly ink = signal<string>(INK_BLACK);
  readonly stageWidth = signal(0);
  private nextId = 1;
  private undoStack: PlacedField[][] = [];
  readonly canUndo = signal(false);
  private drag: DragState | null = null;
  private textSnapshotFor: number | null = null;

  readonly pageFields = computed(() => this.fields().filter((f) => f.page === this.pageNum() - 1));
  readonly selected = computed(() => this.fields().find((f) => f.id === this.selectedId()) ?? null);
  readonly selectedIsText = computed(() => {
    const k = this.selected()?.kind;
    return k === 'text' || k === 'date';
  });

  // ── Firma salvata e finestra di disegno ───────────────────────
  readonly savedSignature = signal<string | null>(null);
  readonly padOpen = signal(false);
  readonly padTab = signal<PadTab>('draw');
  readonly padHasInk = signal(false);
  readonly typedName = signal('');
  readonly typedFont = signal(0);
  readonly uploadImage = signal<string | null>(null);
  readonly removeBg = signal(true);
  readonly remember = signal(true);
  readonly signatureFonts = SIGNATURE_FONTS;
  readonly inkBlack = INK_BLACK;
  readonly inkBlue = INK_BLUE;

  private uploadSource: HTMLCanvasElement | null = null;
  private padCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('padCanvas') private set padCanvas(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.padCanvasRef = ref;
    if (ref) this.initPad(ref.nativeElement);
  }
  @ViewChild('stage') private stageRef?: ElementRef<HTMLElement>;
  private stageObserver?: ResizeObserver;
  private padDrawing = false;
  private padLast: { x: number; y: number } | null = null;

  // ── Esportazione ──────────────────────────────────────────────
  readonly exporting = signal(false);
  readonly exportReady = signal(false);
  readonly justSent = signal(false);
  private lastExportBlob: Blob | null = null;
  private lastExportName = '';

  constructor() {
    // Il riquadro della pagina compare solo dopo l'apertura di un file: si osserva quando c'è.
    effect(() => {
      const url = this.pageUrl();
      if (url && isPlatformBrowser(this.platformId)) queueMicrotask(() => this.observeStage());
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      try { this.savedSignature.set(localStorage.getItem(SIGNATURE_KEY)); } catch { /* storage non disponibile */ }
    }
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
        featureList: ['Draw, type or upload a signature', 'Add text, date and check marks', 'Works in the browser, no upload'],
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
    this.renderToken++;
    this.stageObserver?.disconnect();
    if (this.pageObjectUrl) URL.revokeObjectURL(this.pageObjectUrl);
    void this.pdfDoc?.loadingTask?.destroy?.();
  }

  // ── Apertura file ─────────────────────────────────────────────
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
    if (!(file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf'))) {
      this.fail('sign_pdf.err_not_pdf');
      return;
    }
    this.loading.set(true);
    this.msg.set('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // pdf.js stacca il buffer che riceve (lo trasferisce al worker): gli si passa una copia.
      const doc = await this.pdfjs.openDocument(bytes.slice().buffer);
      void this.pdfDoc?.loadingTask?.destroy?.();
      this.pdfDoc = doc;
      this.sourceBytes = bytes;
      this.fileName.set(file.name);
      this.numPages.set(doc.numPages);
      this.pageNum.set(1);
      this.fields.set([]);
      this.selectedId.set(null);
      this.undoStack = [];
      this.canUndo.set(false);
      this.exportReady.set(false);
      this.lastExportBlob = null;
      await this.renderPage();
    } catch {
      this.fail('sign_pdf.err_open');
    } finally {
      this.loading.set(false);
    }
  }

  closeFile(): void {
    this.renderToken++;
    void this.pdfDoc?.loadingTask?.destroy?.();
    this.pdfDoc = null;
    this.sourceBytes = null;
    this.fileName.set('');
    this.numPages.set(0);
    this.fields.set([]);
    this.selectedId.set(null);
    this.pageUrl.set(null);
    if (this.pageObjectUrl) { URL.revokeObjectURL(this.pageObjectUrl); this.pageObjectUrl = null; }
    this.undoStack = [];
    this.canUndo.set(false);
    this.exportReady.set(false);
    this.msg.set('');
  }

  private fail(key: string): void {
    this.msg.set(`❌ ${this.t.instant(key)}`);
    this.msgOk.set(false);
  }

  // ── Pagina ────────────────────────────────────────────────────
  goTo(n: number): void {
    const clamped = Math.max(1, Math.min(this.numPages(), Math.round(Number(n)) || 1));
    if (clamped === this.pageNum()) return;
    this.pageNum.set(clamped);
    this.selectedId.set(null);
    void this.renderPage();
  }

  private async renderPage(): Promise<void> {
    const doc = this.pdfDoc;
    if (!doc) return;
    const token = ++this.renderToken;
    this.rendering.set(true);
    try {
      const page = await doc.getPage(this.pageNum());
      if (token !== this.renderToken) return;
      const base = page.getViewport({ scale: 1 });
      this.aspect.set(base.height / base.width);
      const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      const cssWidth = this.stageWidth() || 800;
      const scale = Math.max(1, Math.min(3, (cssWidth * dpr) / base.width));
      const blob = await this.pdfjs.renderPageToBlob(page, scale, { maxPixels: MAX_PAGE_PIXELS, retryIfBlank: true });
      page.cleanup?.();
      if (token !== this.renderToken) return;
      const url = URL.createObjectURL(blob);
      const old = this.pageObjectUrl;
      this.pageObjectUrl = url;
      this.pageUrl.set(url);
      if (old) URL.revokeObjectURL(old);
    } catch {
      if (token === this.renderToken) this.fail('sign_pdf.err_render');
    } finally {
      if (token === this.renderToken) this.rendering.set(false);
    }
  }

  private observeStage(): void {
    const el = this.stageRef?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.stageObserver?.disconnect();
    this.stageObserver = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w && w !== this.stageWidth()) this.stageWidth.set(w);
    });
    this.stageObserver.observe(el);
    this.stageWidth.set(Math.round(el.getBoundingClientRect().width));
  }

  // ── Annulla ───────────────────────────────────────────────────
  private snapshot(): void {
    this.undoStack.push(this.fields());
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.canUndo.set(true);
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.fields.set(prev);
    if (!prev.some((f) => f.id === this.selectedId())) this.selectedId.set(null);
    this.canUndo.set(this.undoStack.length > 0);
  }

  // ── Aggiunta dei campi ────────────────────────────────────────
  /** Centro della parte di pagina che l'utente sta guardando, come frazione dell'altezza (la pagina può essere più alta dello schermo). */
  private visibleCenterY(): number {
    const el = this.stageRef?.nativeElement;
    if (!el || typeof window === 'undefined') return 0.4;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return 0.4;
    // Parte della pagina davvero visibile nello schermo: il suo centro. Se la pagina è appena
    // comparsa in fondo allo schermo se ne vede solo la cima, e lì va messo l'elemento.
    const top = clamp01(-r.top / r.height);
    const bottom = clamp01((window.innerHeight - r.top) / r.height);
    return bottom - top < 0.04 ? 0.4 : (top + bottom) / 2;
  }

  private place(kind: FieldKind, partial: Partial<PlacedField> & Pick<PlacedField, 'w' | 'h'>): void {
    const cy = this.visibleCenterY();
    const page = this.pageNum() - 1;
    let x = 0.5 - partial.w / 2;
    let y = cy - partial.h / 2;
    // Ogni nuovo elemento scala di un po' se ce n'è già uno quasi nello stesso punto: senza, più elementi aggiunti di fila si sovrappongono e sembra che ne sia comparso uno solo.
    for (let i = 0; i < 8 && this.fields().some((f) => f.page === page && Math.abs(f.x - x) < 0.04 && Math.abs(f.y - y) < 0.03); i++) {
      y += 0.045;
      if (y + partial.h > 0.97) { y = 0.05; x = Math.min(0.9 - partial.w, x + 0.12); }
    }
    const field = clampField<PlacedField>({
      id: this.nextId++,
      page,
      kind,
      x,
      y,
      ...partial,
    });
    this.snapshot();
    this.fields.update((list) => [...list, field]);
    this.selectedId.set(field.id);
    this.exportReady.set(false);
    this.analytics.trackClick('sign_pdf_add', kind);
  }

  async addSignature(): Promise<void> {
    const saved = this.savedSignature();
    if (saved) await this.placeSignature(saved);
    else this.openPad();
  }

  private async placeSignature(dataUrl: string): Promise<void> {
    const dims = await this.imageSize(dataUrl);
    const w = SIGNATURE_W;
    const h = w * (dims.h / dims.w) / this.aspect();
    this.place('signature', { image: dataUrl, w, h });
  }

  async addMark(kind: 'check' | 'cross'): Promise<void> {
    const image = this.markImage(kind, this.ink());
    this.place(kind, { image, w: MARK_W, h: MARK_W / this.aspect() });
  }

  addText(kind: 'text' | 'date' = 'text'): void {
    const text = kind === 'date' ? formatToday(this.langService.current()) : this.t.instant('sign_pdf.text_default');
    const fs = DEFAULT_FS;
    this.place(kind, { text, fs, color: this.ink(), ...this.textBox(text, fs) });
    this.textSnapshotFor = this.selectedId();
  }

  /** Riquadro approssimato di un testo (serve a tenerlo dentro la pagina; il vero ingombro lo decide il browser). */
  private textBox(text: string, fs: number): { w: number; h: number } {
    return { w: Math.min(0.9, Math.max(fs * 2, text.length * fs * 0.56)), h: (fs * 1.25) / this.aspect() };
  }

  // ── Selezione e modifica ──────────────────────────────────────
  selectField(id: number | null): void {
    this.selectedId.set(id);
  }

  onStagePointerDown(event: PointerEvent): void {
    if (event.target === event.currentTarget || (event.target as HTMLElement).tagName === 'IMG') this.selectedId.set(null);
  }

  removeSelected(): void {
    const id = this.selectedId();
    if (id === null) return;
    this.snapshot();
    this.fields.update((list) => list.filter((f) => f.id !== id));
    this.selectedId.set(null);
    this.exportReady.set(false);
  }

  duplicateSelected(): void {
    const f = this.selected();
    if (!f) return;
    this.snapshot();
    const copy = clampField<PlacedField>({ ...f, id: this.nextId++, x: f.x + 0.03, y: f.y + 0.03 });
    this.fields.update((list) => [...list, copy]);
    this.selectedId.set(copy.id);
    this.exportReady.set(false);
  }

  /** Stessa posizione su tutte le pagine: comodo per sigle a ogni foglio o per la data. */
  applyToAllPages(): void {
    const f = this.selected();
    if (!f) return;
    this.snapshot();
    const extra: PlacedField[] = [];
    for (let p = 0; p < this.numPages(); p++) {
      if (p === f.page) continue;
      if (this.fields().some((x) => x.page === p && x.kind === f.kind && Math.abs(x.x - f.x) < 0.001 && Math.abs(x.y - f.y) < 0.001)) continue;
      extra.push({ ...f, id: this.nextId++, page: p });
    }
    this.fields.update((list) => [...list, ...extra]);
    this.exportReady.set(false);
  }

  resizeSelected(factor: number): void {
    const f = this.selected();
    if (!f) return;
    this.snapshot();
    this.fields.update((list) => list.map((x) => {
      if (x.id !== f.id) return x;
      if (x.fs !== undefined) {
        const fs = Math.min(MAX_FS, Math.max(MIN_FS, x.fs * factor));
        return clampField({ ...x, fs, ...this.textBox(x.text ?? '', fs) });
      }
      return clampField({ ...x, w: x.w * factor, h: x.h * factor });
    }));
    this.exportReady.set(false);
  }

  onTextInput(value: string): void {
    const f = this.selected();
    if (!f) return;
    if (this.textSnapshotFor !== f.id) { this.snapshot(); this.textSnapshotFor = f.id; }
    this.fields.update((list) => list.map((x) => (x.id === f.id ? clampField({ ...x, text: value, ...this.textBox(value, x.fs ?? DEFAULT_FS) }) : x)));
    this.exportReady.set(false);
  }

  setInk(color: string): void {
    this.ink.set(color);
    const f = this.selected();
    if (f && (f.kind === 'text' || f.kind === 'date')) {
      this.snapshot();
      this.fields.update((list) => list.map((x) => (x.id === f.id ? { ...x, color } : x)));
    }
  }

  // ── Trascinamento e ridimensionamento ─────────────────────────
  onFieldPointerDown(event: PointerEvent, field: PlacedField, mode: DragMode): void {
    event.stopPropagation();
    this.selectedId.set(field.id);
    this.textSnapshotFor = field.id;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.drag = { id: field.id, mode, startX: event.clientX, startY: event.clientY, orig: field, pointerId: event.pointerId, moved: false };
  }

  onFieldPointerMove(event: PointerEvent): void {
    const d = this.drag;
    const stage = this.stageRef?.nativeElement;
    if (!d || d.pointerId !== event.pointerId || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - d.startX) / rect.width;
    const dy = (event.clientY - d.startY) / rect.height;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 3) return;
    if (!d.moved) { d.moved = true; this.snapshot(); }

    this.fields.update((list) => list.map((f) => {
      if (f.id !== d.id) return f;
      if (d.mode === 'move') return clampField({ ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy });
      if (d.orig.fs !== undefined) {
        const fs = Math.min(MAX_FS, Math.max(MIN_FS, d.orig.fs + dx * 0.4));
        return clampField({ ...d.orig, fs, ...this.textBox(d.orig.text ?? '', fs) });
      }
      const ratio = d.orig.h / d.orig.w;
      const w = Math.min(0.9, Math.max(0.03, d.orig.w + dx));
      return clampField({ ...d.orig, w, h: w * ratio });
    }));
    this.exportReady.set(false);
  }

  onFieldPointerUp(event: PointerEvent): void {
    if (this.drag?.pointerId === event.pointerId) this.drag = null;
  }

  onFieldKeydown(event: KeyboardEvent, field: PlacedField): void {
    const step = event.shiftKey ? 0.02 : 0.005;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key in moves) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      this.snapshot();
      this.fields.update((list) => list.map((f) => (f.id === field.id ? clampField({ ...f, x: f.x + dx, y: f.y + dy }) : f)));
      this.exportReady.set(false);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.selectedId.set(field.id);
      this.removeSelected();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (!this.canUndo() || !this.pdfDoc) return;
    e.preventDefault();
    this.undo();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.padOpen()) this.closePad();
    else this.selectedId.set(null);
  }

  // ── Finestra della firma ──────────────────────────────────────
  openPad(): void {
    this.padTab.set('draw');
    this.padHasInk.set(false);
    this.uploadImage.set(null);
    this.uploadSource = null;
    this.padOpen.set(true);
  }

  closePad(): void {
    this.padOpen.set(false);
    this.padDrawing = false;
    this.padLast = null;
  }

  setPadTab(tab: PadTab): void {
    this.padTab.set(tab);
  }

  private initPad(canvas: HTMLCanvasElement): void {
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = PAD_W * dpr;
    canvas.height = PAD_H * dpr;
    const ctx = canvas.getContext('2d');
    ctx?.scale(dpr, dpr);
    this.padHasInk.set(false);
  }

  private padPoint(e: PointerEvent): { x: number; y: number } {
    const canvas = this.padCanvasRef?.nativeElement;
    const r = canvas?.getBoundingClientRect();
    if (!canvas || !r) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * PAD_W, y: ((e.clientY - r.top) / r.height) * PAD_H };
  }

  onPadDown(e: PointerEvent): void {
    const canvas = this.padCanvasRef?.nativeElement;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    this.padDrawing = true;
    this.padLast = this.padPoint(e);
    // un tocco senza movimento lascia comunque un punto
    this.padStroke(this.padLast, this.padLast);
  }

  onPadMove(e: PointerEvent): void {
    if (!this.padDrawing || !this.padLast) return;
    const p = this.padPoint(e);
    this.padStroke(this.padLast, p);
    this.padLast = p;
  }

  onPadUp(): void {
    this.padDrawing = false;
    this.padLast = null;
  }

  private padStroke(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const ctx = this.padCanvasRef?.nativeElement.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = this.ink();
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    this.padHasInk.set(true);
  }

  clearPad(): void {
    const canvas = this.padCanvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    this.padHasInk.set(false);
  }

  onTypedName(value: string): void {
    this.typedName.set(value);
  }

  setTypedFont(i: number): void {
    this.typedFont.set(i);
  }

  async onSignatureFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      this.uploadSource = canvas;
      this.refreshUpload();
    } catch {
      this.fail('sign_pdf.err_image');
    }
  }

  setRemoveBg(value: boolean): void {
    this.removeBg.set(value);
    this.refreshUpload();
  }

  private refreshUpload(): void {
    const src = this.uploadSource;
    if (!src) return;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    if (this.removeBg()) {
      const img = ctx.getImageData(0, 0, out.width, out.height);
      whiteToTransparent(img.data);
      ctx.putImageData(img, 0, 0);
    }
    this.uploadImage.set(this.trim(out).toDataURL('image/png'));
  }

  readonly canUsePad = computed(() => {
    switch (this.padTab()) {
      case 'draw': return this.padHasInk();
      case 'type': return this.typedName().trim().length > 0;
      default: return this.uploadImage() !== null;
    }
  });

  async confirmPad(): Promise<void> {
    let dataUrl: string | null = null;
    if (this.padTab() === 'draw') {
      const canvas = this.padCanvasRef?.nativeElement;
      if (canvas) dataUrl = this.trim(canvas).toDataURL('image/png');
    } else if (this.padTab() === 'type') {
      dataUrl = this.renderTyped();
    } else {
      dataUrl = this.uploadImage();
    }
    if (!dataUrl) return;
    if (this.remember()) {
      this.savedSignature.set(dataUrl);
      try { localStorage.setItem(SIGNATURE_KEY, dataUrl); } catch { /* quota/privato: la firma vale per questa sessione */ }
    }
    this.closePad();
    await this.placeSignature(dataUrl);
  }

  forgetSignature(): void {
    this.savedSignature.set(null);
    try { localStorage.removeItem(SIGNATURE_KEY); } catch { /* ignora */ }
  }

  private renderTyped(): string | null {
    const text = this.typedName().trim();
    if (!text) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 260;
    const ctx = canvas.getContext('2d')!;
    ctx.font = SIGNATURE_FONTS[this.typedFont()];
    ctx.fillStyle = this.ink();
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 24, 130, 1352);
    return this.trim(canvas).toDataURL('image/png');
  }

  /** Ritaglia i margini trasparenti: una firma disegnata in un riquadro grande deve occupare solo lo spazio del tratto. */
  private trim(src: HTMLCanvasElement, pad = 6): HTMLCanvasElement {
    const ctx = src.getContext('2d');
    if (!ctx) return src;
    const { width, height } = src;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return src;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  private imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 3, h: 1 });
      // Se il browser non si pronuncia (immagine corrotta, ambiente senza decodifica), si usa una forma di firma tipica.
      setTimeout(() => resolve({ w: 3, h: 1 }), 2000);
      img.src = dataUrl;
    });
  }

  /** Spunta o croce come PNG trasparente: vive nel PDF come qualsiasi altra immagine. */
  private markImage(kind: 'check' | 'cross', color: string): string {
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'check') {
      ctx.moveTo(26, 86); ctx.lineTo(64, 126); ctx.lineTo(136, 36);
    } else {
      ctx.moveTo(34, 34); ctx.lineTo(126, 126);
      ctx.moveTo(126, 34); ctx.lineTo(34, 126);
    }
    ctx.stroke();
    return canvas.toDataURL('image/png');
  }

  // ── Esportazione ──────────────────────────────────────────────
  async download(): Promise<void> {
    if (!this.sourceBytes || this.exporting()) return;
    if (this.fields().length === 0) { this.fail('sign_pdf.err_no_fields'); return; }
    this.exporting.set(true);
    this.msg.set('');
    try {
      const bytes = await exportSignedPdf(this.sourceBytes, this.fields(), { renderTextImage: (text, size, color) => this.renderTextImage(text, size, color) });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const name = `${this.fileName().replace(/\.pdf$/i, '') || 'document'}-firmato.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      // Revoca differita: Safari/iOS avvia il download in modo asincrono.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.lastExportBlob = blob;
      this.lastExportName = name;
      this.exportReady.set(true);
      this.msg.set(`✅ ${this.t.instant('sign_pdf.success')}`);
      this.msgOk.set(true);
      this.analytics.trackClick('sign_pdf_download', String(this.fields().length));
    } catch {
      this.fail('sign_pdf.err_export');
    } finally {
      this.exporting.set(false);
    }
  }

  private async renderTextImage(text: string, sizePt: number, color: string): Promise<{ png: Uint8Array; width: number; height: number } | null> {
    const k = 4; // sovracampionamento: il testo resta nitido da stampato
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const font = `${sizePt * k}px Helvetica, Arial, "Segoe UI", sans-serif`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width) + 4;
    const height = Math.ceil(sizePt * k * 1.3);
    canvas.width = width;
    canvas.height = height;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 2, height / 2);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return null;
    return { png: new Uint8Array(await blob.arrayBuffer()), width: width / k, height: height / k };
  }

  sendToWorkspace(): void {
    if (!this.lastExportBlob) return;
    this.workspace.send({ kind: 'file', blob: this.lastExportBlob, filename: this.lastExportName, mime: 'application/pdf', fromTool: 'sign_pdf' });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }

  fieldFontPx(f: PlacedField): number {
    return (f.fs ?? DEFAULT_FS) * this.stageWidth();
  }
}
