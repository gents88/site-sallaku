import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';
import { FileDropzoneDirective } from '../../../shared/directives/file-dropzone.directive';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';
import {
  ConversionService, ConversionTypeId, CONVERSION_TYPES, ConversionDef,
} from '../../../core/services/conversion.service';

type Step = 'preview' | 'convert';
type Kind = 'pdf' | 'image' | 'text' | 'base64' | 'unknown';

/** Mirrors the backend's FilesInterceptor('files', MAX_FILE_COUNT) cap in conversion.controller.ts. */
const MULTI_MAX_FILES = 20;

const GROUP_META: Record<string, { icon: string; nameKey: string; descKey: string }> = {
  'Documenti':   { icon: '📄', nameKey: 'convert.group_docs',       descKey: 'convert.group_docs_desc'       },
  'Spreadsheet': { icon: '📊', nameKey: 'convert.group_sheets',     descKey: 'convert.group_sheets_desc'     },
  'Immagini':    { icon: '🖼️', nameKey: 'convert.group_images',     descKey: 'convert.group_images_desc'     },
  'Strutturati': { icon: '🗃️', nameKey: 'convert.group_structured', descKey: 'convert.group_structured_desc' },
  'Base64':      { icon: '🔐', nameKey: 'convert.group_base64',     descKey: 'convert.group_base64_desc'     },
  'Utilità':     { icon: '🔧', nameKey: 'convert.group_utils',      descKey: 'convert.group_utils_desc'      },
};

@Component({
  selector: 'app-convert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, FileDropzoneDirective, RouterLink],
  templateUrl: './convert.component.html',
  styleUrls: ['./convert.component.scss'],
})
export class ConvertComponent implements OnInit, OnDestroy {
  private readonly svc = inject(ConversionService);
  private readonly san = inject(DomSanitizer);
  private readonly t   = inject(TranslateService);
  private readonly seo = inject(SeoService);
  private readonly workspace = inject(WorkspaceService);

  readonly searchQuery = signal('');
  // Starts empty on purpose: reading localStorage here would make this SSR/prerendered
  // page's initial render diverge from the server's (favorites are inherently
  // client-only), which breaks Angular hydration with a null DOM-node mismatch the
  // moment a real visitor has any favorite saved. Populated just after hydration
  // settles instead — see the afterNextRender() call below.
  readonly favorites   = signal<Set<string>>(new Set());
  readonly totalCount  = CONVERSION_TYPES.length;

  /** Blog cross-link: real, relevant existing post — see task note in this file's PR. */
  readonly blogGuideUrl = '/blog/come-convertire-pdf-in-word-senza-perdere-formattazione';

  /** Set once at startup from a pending Workspace hand-off (file kind only); cleared on use/dismiss. */
  readonly workspaceItem = signal<WorkspaceItem | null>(null);

  constructor() {
    // Client-only, runs once right after the initial (hydrated) render is stable —
    // safe to read localStorage here, unlike a field initializer or ngOnInit, both
    // of which also execute during SSR/prerendering.
    afterNextRender(() => this.favorites.set(this.loadFavs()));
  }

  ngOnInit(): void {
    const pending = this.workspace.peek();
    if (pending && pending.kind === 'file') {
      this.workspaceItem.set(pending);
    }
    this.seo.update({
      title: 'Free File Converter — PDF, Word, Excel, Images & More',
      description: `Convert between PDF, DOCX, TXT, HTML, XLSX, CSV, JSON, PNG, JPG and more — ${this.totalCount} conversion types, free, in your browser. No signup needed.`,
      url: 'https://gentsallaku.it/lab/convert',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free File Converter',
      description: `Convert files between PDF, Word, Excel, images and other formats — ${this.totalCount} conversion types, entirely in the browser.`,
      url: 'https://gentsallaku.it/lab/convert',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['PDF to Word/Text/HTML', 'Word to PDF', 'Excel/CSV conversion', 'Image format conversion', 'Base64 encode/decode', 'Favorites & instant search'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  private readonly allGroups = (() => {
    const map = new Map<string, ConversionDef[]>();
    for (const c of CONVERSION_TYPES as unknown as ConversionDef[]) {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      icon:    GROUP_META[name]?.icon    ?? '📁',
      nameKey: GROUP_META[name]?.nameKey ?? name,
      descKey: GROUP_META[name]?.descKey ?? '',
      items,
    }));
  })();

  readonly visibleGroups = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.allGroups;
    return this.allGroups
      .map(g => ({
        ...g,
        items: g.items.filter(c =>
          c.label.toLowerCase().includes(q) ||
          c.from.toLowerCase().includes(q) ||
          c.to.toLowerCase().includes(q) ||
          g.name.toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.items.length > 0);
  });

  readonly favoriteItems = computed(() => {
    const favs = this.favorites();
    return (CONVERSION_TYPES as unknown as ConversionDef[]).filter(c => favs.has(c.id));
  });

  trackByFileName = (_: number, f: File): string => f.name;

  // Modal state
  readonly openModal   = signal(false);
  readonly selectedDef = signal<ConversionDef | null>(null);
  readonly step        = signal<Step>('preview');
  readonly run         = signal(false);
  readonly file        = signal<File | null>(null);
  readonly kind        = signal<Kind>('unknown');
  readonly meta        = signal<{ name: string; size: string; type: string; pages: number | null } | null>(null);
  readonly txt         = signal('');
  readonly img         = signal<string | null>(null);
  readonly pdf         = signal<SafeResourceUrl | null>(null);
  readonly msg         = signal('');
  readonly hint        = signal('');
  readonly msgOk       = signal(false);

  /** Files staged for a `multi: true` conversion type (e.g. merge-pdf, image-to-pdf). */
  readonly files       = signal<File[]>([]);
  /**
   * Shared status of the batch call. The backend combines every staged file into a
   * SINGLE output (merged PDF, images bundled into one PDF) — it does not convert
   * files independently — so this status applies to the whole batch, not per-file.
   */
  readonly batchStatus = signal<'pending' | 'running' | 'done' | 'error'>('pending');

  /** Captured on every successful conversion (single, multi-batch and base64 paths all funnel through `download()`). */
  readonly lastResult  = signal<{ blob: Blob; filename: string; mime: string } | null>(null);
  readonly justSent    = signal(false);

  private url: string | null = null;
  private ext = '';
  private b64: string | null = null;
  private done = false;

  readonly isMulti = computed(() => this.selectedDef()?.multi ?? false);

  readonly hasSelection = computed(() =>
    this.isMulti() ? this.files().length > 0 : Boolean(this.file()),
  );

  readonly canConvert = computed(() => {
    const def = this.selectedDef();
    if (!def || this.run()) return false;

    if (def.multi) {
      const fs = this.files();
      if (fs.length === 0) return false;
      if (def.id === 'merge-pdf' && fs.length < 2) return false;
      return fs.every(f => this.matchesAccept(def, f));
    }

    const f = this.file();
    if (!f) return false;
    if (def.id.startsWith('base64-')) return Boolean(this.b64);
    return this.matchesAccept(def, f);
  });

  matchesAccept(def: ConversionDef, f: File): boolean {
    if (!def.accept || def.accept === '*') return true;
    const exts = def.accept.split(',').map(a => a.trim().replace('.', '').toLowerCase());
    const ext = this.extOf(f.name);
    return exts.includes(ext) || exts.some(e => f.type.includes(e));
  }

  ngOnDestroy(): void { this.clean(); }

  open(def: ConversionDef): void {
    this.clean();
    this.selectedDef.set(def);
    this.openModal.set(true);
    this.step.set('preview');
    this.file.set(null);
    this.files.set([]);
    this.meta.set(null);
    this.kind.set('unknown');
    this.txt.set('');
    this.msg.set('');
    this.hint.set('');
    this.msgOk.set(false);
    this.batchStatus.set('pending');
    this.done = false;
    this.b64  = null;
    this.ext  = '';
    this.lastResult.set(null);
    this.justSent.set(false);
  }

  /** Loads the pending Workspace file into this modal's current selection, per single/multi flow. */
  useWorkspaceFile(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'file' || !item.blob) return;
    const f = new File([item.blob], item.filename, { type: item.mime });
    if (this.isMulti()) {
      const merged = [...this.files(), f].slice(0, MULTI_MAX_FILES);
      this.files.set(merged);
      this.step.set('preview');
      this.msg.set('');
      this.msgOk.set(false);
      this.batchStatus.set('pending');
      this.done = false;
    } else {
      this.load(f);
    }
  }

  /** Local-only dismiss — does NOT consume the Workspace item, so another tool can still pick it up. */
  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  sendToWorkspace(): void {
    const r = this.lastResult();
    if (!r) return;
    this.workspace.send({
      kind: 'file',
      blob: r.blob,
      filename: r.filename,
      mime: r.mime || undefined,
      fromTool: 'convert',
    });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }

  toggleFav(event: Event, id: string): void {
    event.stopPropagation();
    const next = new Set(this.favorites());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.favorites.set(next);
    this.saveFavs(next);
  }

  back(): void { this.step.set('preview'); this.msg.set(''); this.msgOk.set(false); }

  tryClose(): void {
    if (this.run()) return;
    const hasWork = this.file() !== null || this.files().length > 0;
    if (hasWork && !this.done && !confirm(this.t.instant('convert.close_confirm'))) return;
    this.openModal.set(false);
  }

  select(e: Event): void {
    const input = e.target as HTMLInputElement;
    const list = input.files;
    if (!list || list.length === 0) return;
    if (this.isMulti()) {
      this.addFiles(list);
      input.value = '';
    } else {
      this.load(list[0] ?? null);
    }
  }

  onFilesDropped(files: FileList): void {
    if (this.isMulti()) {
      this.addFiles(files);
    } else {
      this.load(files[0] ?? null);
    }
  }

  private addFiles(list: FileList): void {
    const incoming = Array.from(list);
    const merged = [...this.files(), ...incoming].slice(0, MULTI_MAX_FILES);
    this.files.set(merged);
    this.step.set('preview');
    this.msg.set('');
    this.msgOk.set(false);
    this.batchStatus.set('pending');
    this.done = false;
  }

  removeFile(i: number): void {
    const next = this.files().slice();
    next.splice(i, 1);
    this.files.set(next);
  }

  confirm(): void {
    if (!this.hasSelection()) return;
    this.step.set('convert');
    this.msg.set('');
    this.msgOk.set(false);
    this.batchStatus.set('pending');
  }

  batchIcon(): string {
    switch (this.batchStatus()) {
      case 'done': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  }

  batchStatusLabel(): string {
    switch (this.batchStatus()) {
      case 'done': return 'convert.batch_done';
      case 'error': return 'convert.batch_error';
      case 'running': return 'convert.in_progress';
      default: return 'convert.batch_pending';
    }
  }

  convert(): void {
    const def = this.selectedDef();
    if (!def || !this.canConvert()) return;

    this.run.set(true);
    this.msg.set(this.t.instant('convert.in_progress'));
    this.msgOk.set(false);
    this.done = false;

    if (def.id.startsWith('base64-')) {
      this.svc.convertBase64(def.id as ConversionTypeId, this.b64 ?? '').subscribe({
        next: (b) => {
          this.download(b, def.to.toLowerCase());
          this.done = true;
          this.run.set(false);
          this.msg.set(this.t.instant('convert.success'));
          this.msgOk.set(true);
        },
        error: (err) => { this.run.set(false); this.msg.set(this.errMsg(err)); },
      });
      return;
    }

    if (def.multi) {
      const fs = this.files();
      if (fs.length === 0) { this.run.set(false); this.msg.set(this.t.instant('convert.no_file')); return; }

      this.batchStatus.set('running');
      this.svc.convertFiles(def.id as ConversionTypeId, fs).subscribe({
        next: (ev) => {
          if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
            if (ev.body instanceof Blob) {
              this.download(ev.body, this.outputExt(def), this.batchBaseName(def));
              this.done = true;
              this.batchStatus.set('done');
              this.msg.set(this.t.instant('convert.success'));
              this.msgOk.set(true);
            } else {
              this.batchStatus.set('error');
              this.msg.set(this.t.instant('convert.payload_not_downloadable'));
            }
            this.run.set(false);
          }
        },
        error: (err) => {
          this.run.set(false);
          this.batchStatus.set('error');
          this.msg.set(this.errMsg(err));
        },
      });
      return;
    }

    const f = this.file();
    if (!f) { this.run.set(false); this.msg.set(this.t.instant('convert.no_file')); return; }

    this.svc.convertFiles(def.id as ConversionTypeId, [f]).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          if (ev.body instanceof Blob) {
            this.download(ev.body, this.outputExt(def));
            this.done = true;
            this.msg.set(this.t.instant('convert.success'));
            this.msgOk.set(true);
          } else {
            this.msg.set(this.t.instant('convert.payload_not_downloadable'));
          }
          this.run.set(false);
        }
      },
      error: (err) => { this.run.set(false); this.msg.set(this.errMsg(err)); },
    });
  }

  private batchBaseName(def: ConversionDef): string {
    if (def.id === 'merge-pdf') return 'merged';
    if (def.id === 'image-to-pdf') return 'images';
    return 'converted-files';
  }

  private errMsg(err: { status?: number; error?: { message?: string } | Blob }): string {
    const status = err?.status ?? 0;
    const label  = status ? ` (HTTP ${status})` : '';
    if (status === 401 || status === 403) return `❌ ${this.t.instant('convert.err_unauthorized')}`;
    if (status === 413) return `❌ ${this.t.instant('convert.err_too_large')}`;
    if (status === 415) return `❌ ${this.t.instant('convert.err_unsupported')}`;
    if (err?.error instanceof Blob) {
      err.error.text().then(text => {
        try {
          const parsed = JSON.parse(text) as { message?: string };
          const detail = Array.isArray(parsed?.message) ? parsed.message.join('; ') : (parsed?.message ?? '');
          if (detail) this.msg.set(`❌ ${detail}${label}`);
        } catch { /* not JSON */ }
      });
      return `❌ ${this.t.instant('convert.err_failed')}${label}`;
    }
    if (typeof err?.error?.message === 'string') return `❌ ${err.error.message}${label}`;
    if (status === 400) return `❌ ${this.t.instant('convert.err_invalid')}${label}`;
    return `❌ ${this.t.instant('convert.err_failed')}${label}`;
  }

  private outputExt(def: ConversionDef): string {
    const m: Record<string, string> = { 'B64': 'txt', 'ZIP': 'zip' };
    return m[def.to] ?? def.to.toLowerCase();
  }

  private async load(f: File | null): Promise<void> {
    if (!f) return;
    this.clean();
    this.file.set(f);
    this.step.set('preview');
    this.msg.set('');
    this.msgOk.set(false);
    this.done = false;
    this.b64  = null;

    this.ext = this.extOf(f.name);
    const k  = this.detect(f);
    this.kind.set(k);
    this.meta.set({ name: f.name, size: this.bytes(f.size), type: f.type || 'unknown', pages: null });

    if (k === 'pdf' || k === 'image') this.url = URL.createObjectURL(f);

    if (k === 'pdf' && this.url) {
      this.pdf.set(this.san.bypassSecurityTrustResourceUrl(this.url));
      this.img.set(null);
      this.txt.set('');
    } else if (k === 'image' && this.url) {
      this.img.set(this.url);
      this.pdf.set(null);
      this.txt.set('');
    } else if (k === 'text' || k === 'base64') {
      this.img.set(null);
      this.pdf.set(null);
      const t = await f.text();
      this.txt.set(t.slice(0, 5000));
      if (k === 'base64') this.b64 = this.parseB64(t);
    } else {
      this.img.set(null);
      this.pdf.set(null);
      this.txt.set('');
    }
    this.hint.set(this.suggestTip(f.name, k));
  }

  private detect(f: File): Kind {
    const m = f.type.toLowerCase();
    const e = this.extOf(f.name);
    if (m.includes('pdf') || e === 'pdf') return 'pdf';
    if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(e)) return 'image';
    if (['csv', 'json', 'txt', 'md', 'html', 'htm'].includes(e)) return 'text';
    if (e === 'b64' || e === 'base64') return 'base64';
    return 'unknown';
  }

  /**
   * Plain filename/kind keyword matching — NOT an AI/LLM call. Kept honest on purpose:
   * this only suggests a likely conversion based on the filename and detected file kind,
   * unlike the genuinely LLM-backed tools elsewhere in AI & Tools (PDF Summary, AI
   * Formatter, PDF Translate, AI Slides). Do not relabel this as "AI" in the UI.
   */
  private suggestTip(name: string, k: Kind): string {
    const n = name.toLowerCase();
    if (n.includes('invoice') || n.includes('fattura'))    return this.t.instant('convert.hint_invoice');
    if (n.includes('contract') || n.includes('contratto')) return this.t.instant('convert.hint_contract');
    if (k === 'pdf')           return this.t.instant('convert.hint_pdf');
    if (k === 'image')         return this.t.instant('convert.hint_image');
    if (this.ext === 'csv')    return this.t.instant('convert.hint_csv');
    if (this.ext === 'json')   return this.t.instant('convert.hint_json');
    return '';
  }

  private extOf(n: string): string {
    const p = n.toLowerCase().split('.');
    return p.length > 1 ? p[p.length - 1] : '';
  }

  private parseB64(v: string): string | null {
    const t = v.trim();
    if (!t) return null;
    if (t.startsWith('data:')) {
      const c = t.indexOf(',');
      return c >= 0 ? t.slice(c + 1) : null;
    }
    const x = t.replace(/\s+/g, '');
    return /^[A-Za-z0-9+/=]+$/.test(x) ? x : null;
  }

  /** Public: also used from the multi-file list template to render each staged file's size. */
  bytes(s: number): string {
    if (s === 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(s) / Math.log(1024)), u.length - 1);
    const v = s / 1024 ** i;
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
  }

  private download(b: Blob, e: string, baseName?: string): void {
    const n = baseName ?? (this.file()?.name.replace(/\.[^.]+$/, '') || 'converted-file');
    const filename = `${n}.${e}`;
    this.lastResult.set({ blob: b, filename, mime: b.type || '' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(u);
  }

  private clean(): void {
    if (this.url) { URL.revokeObjectURL(this.url); this.url = null; }
    this.img.set(null);
    this.pdf.set(null);
  }

  private loadFavs(): Set<string> {
    try {
      const raw = localStorage.getItem('convert-favs');
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  }

  private saveFavs(favs: Set<string>): void {
    try { localStorage.setItem('convert-favs', JSON.stringify([...favs])); } catch { /* storage unavailable */ }
  }
}
