import {
  Component, ChangeDetectionStrategy, OnInit, OnDestroy, ElementRef, ViewChild,
  PLATFORM_ID, afterNextRender, inject, signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { timeout, TimeoutError } from 'rxjs';
import DOMPurify from 'dompurify';
import { ConversionService, ConversionTypeId } from '../../../core/services/conversion.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService, WorkspaceItem } from '../../../core/services/workspace.service';

type ExportFormat = 'pdf' | 'docx' | 'html';

/** Chiave localStorage per l'autosave della bozza (protegge da refresh/chiusura accidentale). */
const EDITOR_DRAFT_KEY = 'editor-draft';
/** Debounce dell'autosave: evita di scrivere su localStorage ad ogni singolo carattere. */
const DRAFT_SAVE_DEBOUNCE_MS = 1000;
/** Allineato al limite del backend condiviso con Convert (MAX_FILE_SIZE in conversion.controller.ts). */
const MAX_IMPORT_FILE_MB = 50;

interface EditorDraft {
  docName: string;
  html: string;
}

interface ToolBtn {
  cmd: string;
  arg?: string;
  icon: string;
  labelKey: string;
}

const TOOLBAR: ToolBtn[][] = [
  [
    { cmd: 'bold', icon: 'B', labelKey: 'editor.bold' },
    { cmd: 'italic', icon: 'I', labelKey: 'editor.italic' },
    { cmd: 'underline', icon: 'U', labelKey: 'editor.underline' },
    { cmd: 'strikeThrough', icon: 'S̶', labelKey: 'editor.strike' },
  ],
  [
    { cmd: 'insertUnorderedList', icon: '•≡', labelKey: 'editor.ul' },
    { cmd: 'insertOrderedList', icon: '1≡', labelKey: 'editor.ol' },
    { cmd: 'formatBlock', arg: 'blockquote', icon: '❝', labelKey: 'editor.quote' },
  ],
  [
    { cmd: 'justifyLeft', icon: '⇤', labelKey: 'editor.align_left' },
    { cmd: 'justifyCenter', icon: '↔', labelKey: 'editor.align_center' },
    { cmd: 'justifyRight', icon: '⇥', labelKey: 'editor.align_right' },
  ],
  [
    { cmd: 'undo', icon: '↶', labelKey: 'editor.undo' },
    { cmd: 'redo', icon: '↷', labelKey: 'editor.redo' },
    { cmd: 'removeFormat', icon: '⌫', labelKey: 'editor.clear_format' },
  ],
];

@Component({
  selector: 'app-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
})
export class EditorComponent implements OnInit, OnDestroy {
  private readonly conv = inject(ConversionService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);
  private readonly workspace = inject(WorkspaceService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('sheet', { static: true }) private sheetRef!: ElementRef<HTMLDivElement>;

  readonly toolbar = TOOLBAR;
  readonly docName = signal('');
  readonly wordCount = signal(0);
  readonly importing = signal(false);
  readonly exporting = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly workspaceItem = signal<WorkspaceItem | null>(null);
  readonly justSent = signal(false);

  private draftSaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Deferred to right after the initial (hydrated) render, not ngOnInit: restoring
    // the draft / offering a Workspace item mutates content that's part of the
    // template (docName, wordCount, the contenteditable body) during ngOnInit, which
    // runs before hydration reconciliation on the client — that would make the first
    // client render diverge from the server's (always-empty) one, and Angular can't
    // reconcile the resulting DOM mismatch.
    afterNextRender(() => {
      // Ripristino della bozza: eseguito solo qui, prima di qualunque interazione
      // dell'utente (import compreso), quindi è per costruzione un "fresh load".
      this.restoreDraft();

      // Un item Workspace viene offerto solo se il ripristino bozza non ha già
      // popolato l'editor — non deve mai sovrascrivere contenuto già presente.
      if (this.isBrowser && !this.sheetRef.nativeElement.innerText.trim()) {
        const pending = this.workspace.peek();
        if (pending && pending.kind === 'text') {
          this.workspaceItem.set(pending);
        }
      }
    });
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Online Document Editor — Export to PDF & DOCX',
      description: 'Write and format documents in your browser, import Word files and export to PDF, DOCX or HTML. Free, no signup.',
      url: 'https://gentsallaku.it/lab/editor',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free Online Document Editor',
      description: 'Write and format documents in the browser, import Word files and export to PDF, DOCX or HTML.',
      url: 'https://gentsallaku.it/lab/editor',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Rich text editing', 'Import Word (.docx)', 'Export to PDF/DOCX/HTML', 'Word count'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void {
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
  }

  onDocNameChange(value: string): void {
    this.docName.set(value);
    this.scheduleDraftSave();
  }

  exec(cmd: string, arg?: string): void {
    this.sheetRef.nativeElement.focus();
    document.execCommand(cmd, false, arg);
    this.onEdit();
  }

  block(tag: string): void {
    if (tag) this.exec('formatBlock', tag);
  }

  addLink(): void {
    const url = prompt(this.t.instant('editor.link_prompt'));
    if (url) this.exec('createLink', url);
  }

  onEdit(): void {
    const text = this.sheetRef.nativeElement.innerText.trim();
    this.wordCount.set(text ? text.split(/\s+/).length : 0);
    this.scheduleDraftSave();
  }

  useWorkspaceText(): void {
    const item = this.workspace.take();
    this.workspaceItem.set(null);
    if (!item || item.kind !== 'text' || !item.text) return;
    this.setContent(this.textToHtml(item.text));
  }

  dismissWorkspaceBanner(): void {
    this.workspaceItem.set(null);
  }

  sendToWorkspace(): void {
    const text = this.sheetRef.nativeElement.innerText.trim();
    if (!text) return;
    const name = this.docName().trim() || 'document';
    this.workspace.send({ kind: 'text', text, filename: `${name}.txt`, fromTool: 'editor' });
    this.justSent.set(true);
    setTimeout(() => this.justSent.set(false), 1500);
  }

  // ── Import ───────────────────────────────────────────────────────────

  async importFile(e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;

    this.msg.set('');
    if (f.size > MAX_IMPORT_FILE_MB * 1024 * 1024) {
      this.msg.set(`❌ ${this.t.instant('editor.err_file_too_large', { max: MAX_IMPORT_FILE_MB, name: f.name })}`);
      return;
    }
    const ext = f.name.toLowerCase().split('.').pop() ?? '';
    if (!this.docName()) this.docName.set(f.name.replace(/\.[^.]+$/, ''));

    try {
      if (ext === 'txt') {
        this.setContent(this.textToHtml(await f.text()));
      } else if (ext === 'html' || ext === 'htm') {
        this.setContent(this.sanitizeHtml(await f.text()));
      } else if (ext === 'md') {
        await this.importViaConversion(f, 'md-to-html');
      } else if (ext === 'docx') {
        await this.importViaConversion(f, 'docx-to-html');
      } else {
        this.msg.set(`❌ ${this.t.instant('editor.err_format')}`);
      }
    } catch {
      this.importing.set(false);
      this.msg.set(`❌ ${this.t.instant('editor.err_import')}`);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────

  exportAs(format: ExportFormat): void {
    const body = this.sheetRef.nativeElement.innerHTML;
    if (!this.sheetRef.nativeElement.innerText.trim()) {
      this.msg.set(`❌ ${this.t.instant('editor.err_empty')}`);
      this.msgOk.set(false);
      return;
    }
    const html = this.wrapHtml(body);
    const name = this.docName().trim() || 'document';

    if (format === 'html') {
      this.download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${name}.html`);
      this.clearDraft();
      return;
    }

    const type: ConversionTypeId = format === 'pdf' ? 'html-to-pdf' : 'html-to-docx';
    const file = new File([html], `${name}.html`, { type: 'text/html' });

    this.exporting.set(true);
    this.msg.set('');
    this.msgOk.set(false);
    this.conv.convertFiles(type, [file]).pipe(timeout(60000)).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          this.exporting.set(false);
          if (ev.body instanceof Blob) {
            this.download(ev.body, `${name}.${format}`);
            this.msg.set(`✅ ${this.t.instant('editor.success')}`);
            this.msgOk.set(true);
            this.clearDraft();
          } else {
            this.msg.set(`❌ ${this.t.instant('editor.err_export')}`);
          }
        }
      },
      error: (err) => {
        this.exporting.set(false);
        const key = err instanceof TimeoutError ? 'editor.err_timeout' : 'editor.err_export';
        this.msg.set(`❌ ${this.t.instant(key)}`);
      },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async importViaConversion(f: File, type: ConversionTypeId): Promise<void> {
    this.importing.set(true);
    this.conv.convertFiles(type, [f]).pipe(timeout(60000)).subscribe({
      next: async (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          this.importing.set(false);
          if (ev.body instanceof Blob) {
            this.setContent(this.sanitizeHtml(await ev.body.text()));
          } else {
            this.msg.set(`❌ ${this.t.instant('editor.err_import')}`);
          }
        }
      },
      error: (err) => {
        this.importing.set(false);
        const key = err instanceof TimeoutError ? 'editor.err_timeout' : 'editor.err_import';
        this.msg.set(`❌ ${this.t.instant(key)}`);
      },
    });
  }

  private setContent(html: string): void {
    this.sheetRef.nativeElement.innerHTML = html;
    this.onEdit();
  }

  // ── Autosave bozza (localStorage) ───────────────────────────────────────
  // Protegge da refresh/chiusura/navigazione accidentale: essendo localStorage
  // (non sessionStorage) la bozza sopravvive anche alla chiusura del tab/browser,
  // quindi copre lo stesso scenario per cui servirebbe un prompt beforeunload.
  // Per questo non aggiungiamo anche il prompt nativo "vuoi uscire?": nagerebbe
  // l'utente ad ogni uscita dalla pagina pur avendo già il contenuto al sicuro,
  // senza reale beneficio se non nel caso limite della navigazione privata con
  // storage cancellato alla chiusura — troppo marginale per giustificare il fastidio.

  /** Ripristina la bozza salvata, se presente, solo al caricamento iniziale del componente. */
  private restoreDraft(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<EditorDraft>;
      if (!draft.html || !draft.html.trim()) return;
      this.sheetRef.nativeElement.innerHTML = draft.html;
      if (draft.docName) this.docName.set(draft.docName);
      this.onEdit();
    } catch {
      // Bozza corrotta o non leggibile: ignora silenziosamente, si riparte da vuoto.
    }
  }

  private scheduleDraftSave(): void {
    if (!this.isBrowser) return;
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = setTimeout(() => this.saveDraft(), DRAFT_SAVE_DEBOUNCE_MS);
  }

  private saveDraft(): void {
    if (!this.isBrowser) return;
    if (!this.sheetRef.nativeElement.innerText.trim()) {
      // Editor vuoto: non ha senso tenere in giro una bozza vuota.
      localStorage.removeItem(EDITOR_DRAFT_KEY);
      return;
    }
    const draft: EditorDraft = { docName: this.docName(), html: this.sheetRef.nativeElement.innerHTML };
    try {
      localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Storage pieno o non disponibile (es. navigazione privata): l'autosave
      // diventa no-op, ma non deve mai bloccare la scrittura nell'editor.
    }
  }

  /** Svuota la bozza salvata: chiamato quando "il lavoro è fatto" (export riuscito). */
  private clearDraft(): void {
    if (!this.isBrowser) return;
    if (this.draftSaveTimer) clearTimeout(this.draftSaveTimer);
    localStorage.removeItem(EDITOR_DRAFT_KEY);
  }

  /**
   * Sanitizza l'HTML importato prima di iniettarlo nel contenteditable.
   * Usa DOMPurify (libreria matura, non una sanitizzazione manuale ad hoc) perché
   * l'assegnazione è diretta a innerHTML, fuori dal binding template di Angular:
   * il DomSanitizer di Angular non entra in gioco su questo percorso.
   */
  private sanitizeHtml(raw: string): string {
    return DOMPurify.sanitize(raw, {
      FORBID_TAGS: ['script', 'style', 'link', 'meta', 'iframe', 'object', 'embed'],
    });
  }

  private textToHtml(text: string): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private wrapHtml(body: string): string {
    const title = this.docName().trim() || 'document';
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title.replace(/</g, '&lt;')}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #1f2328; max-width: 700px; margin: 2rem auto; }
  h1, h2, h3 { line-height: 1.3; }
  blockquote { border-left: 3px solid #d1d5db; margin-left: 0; padding-left: 1rem; color: #4b5563; }
  pre { background: #f3f4f6; padding: .75rem; border-radius: 6px; font-size: 10pt; }
</style>
</head>
<body>${body}</body>
</html>`;
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
