import {
  Component, ChangeDetectionStrategy, OnInit, ElementRef, ViewChild,
  inject, signal,
} from '@angular/core';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConversionService, ConversionTypeId } from '../../../core/services/conversion.service';
import { SeoService } from '../../../core/services/seo.service';

type ExportFormat = 'pdf' | 'docx' | 'html';

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
  template: `
    <div class="cp-page">
      <header class="cp-header">
        <h1 class="cp-title">✏️ {{ 'editor.title' | translate }}</h1>
        <p class="cp-subtitle">{{ 'editor.subtitle' | translate }}</p>
      </header>

      <div class="cp-panel">
        <!-- ── Barra documento ─────────────────────── -->
        <div class="doc-bar">
          <input class="in doc-name" type="text" maxlength="80"
                 [placeholder]="'editor.doc_name_placeholder' | translate"
                 [value]="docName()" (input)="docName.set($any($event.target).value)">
          <div class="ac">
            <button class="btn btn-s" (click)="pick.click()">{{ 'editor.import' | translate }}</button>
            <input #pick type="file" hidden accept=".docx,.txt,.md,.html,.htm" (change)="importFile($event)">
            <button class="btn btn-s" [disabled]="exporting()" (click)="exportAs('html')">HTML</button>
            <button class="btn btn-s" [disabled]="exporting()" (click)="exportAs('docx')">DOCX</button>
            <button class="btn btn-p" [disabled]="exporting()" (click)="exportAs('pdf')">
              {{ exporting() ? ('editor.exporting' | translate) : 'PDF' }}
            </button>
          </div>
        </div>

        <!-- ── Toolbar formattazione ────────────────── -->
        <div class="fmt-bar">
          <select class="sel" (change)="block($any($event.target).value); $any($event.target).value = ''">
            <option value="" disabled selected>{{ 'editor.style' | translate }}</option>
            <option value="p">{{ 'editor.paragraph' | translate }}</option>
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
            <option value="pre">{{ 'editor.code' | translate }}</option>
          </select>
          @for (group of toolbar; track $index) {
            <span class="fmt-group">
              @for (b of group; track b.cmd + (b.arg ?? '')) {
                <button class="tb" [title]="b.labelKey | translate" (click)="exec(b.cmd, b.arg)">{{ b.icon }}</button>
              }
            </span>
          }
          <span class="fmt-group">
            <button class="tb" [title]="'editor.link' | translate" (click)="addLink()">🔗</button>
          </span>
          <span class="words">{{ wordCount() }} {{ 'editor.words' | translate }}</span>
        </div>

        <!-- ── Area di scrittura ────────────────────── -->
        <div #sheet class="sheet" contenteditable="true"
             [attr.data-placeholder]="'editor.placeholder' | translate"
             (input)="onEdit()"></div>

        @if (importing()) {
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill"></div></div>
          </div>
        }
        @if (msg()) {
          <p class="msg" [class.msg--ok]="msgOk()">{{ msg() }}</p>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cp-page { min-height: 100%; padding: 2rem; background: var(--bg-primary, #0d1117); max-width: 1000px; margin: 0 auto; }
    .cp-header { margin-bottom: 1.75rem; }
    .cp-title { font-size: 1.75rem; font-weight: 700; color: var(--text-primary, #e6edf3); margin: 0 0 0.25rem; }
    .cp-subtitle { color: var(--text-secondary, #8b949e); margin: 0; font-size: 0.9rem; }

    .cp-panel {
      background: var(--bg-secondary, #161b22); border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; padding: 1.25rem; color: var(--text-primary, #e6edf3);
    }

    .doc-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: .75rem; }
    .doc-name { flex: 1; min-width: 180px; }
    .in {
      padding: 0.5rem 0.75rem; border-radius: 9px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-primary, #0d1117); color: var(--text-primary, #e6edf3);
      font-family: inherit; font-size: 0.9rem; box-sizing: border-box;
    }
    .in:focus { outline: none; border-color: var(--accent, #6c63ff); }

    .fmt-bar {
      display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
      padding: .5rem; border: 1px solid var(--border-color, #30363d); border-radius: 10px;
      background: var(--bg-primary, #0d1117); margin-bottom: .75rem;
      position: sticky; top: 0; z-index: 10;
    }
    .fmt-group { display: inline-flex; gap: .15rem; padding-right: .6rem; border-right: 1px solid var(--border-color, #30363d); }
    .fmt-group:last-of-type { border-right: none; }
    .sel {
      padding: 0.35rem 0.5rem; border-radius: 8px; border: 1px solid var(--border-color, #30363d);
      background: var(--bg-tertiary, #1c2333); color: var(--text-primary, #e6edf3);
      font-family: inherit; font-size: 0.8rem;
    }
    .tb {
      min-width: 30px; height: 30px; padding: 0 .4rem; border-radius: 7px;
      border: 1px solid transparent; background: none; color: var(--text-primary, #e6edf3);
      cursor: pointer; font-size: .85rem; font-family: inherit;
    }
    .tb:hover { background: var(--bg-tertiary, #1c2333); border-color: var(--border-color, #30363d); }
    .words { margin-left: auto; font-size: .72rem; color: var(--text-secondary, #8b949e); white-space: nowrap; }

    .sheet {
      min-height: 55vh; background: #fff; color: #1f2328; border-radius: 10px;
      padding: 2.25rem 2.5rem; outline: none; font-size: 1rem; line-height: 1.65;
      font-family: Georgia, 'Times New Roman', serif; overflow-wrap: break-word;
      box-shadow: 0 4px 24px rgba(0,0,0,.45);
    }
    .sheet:empty::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
    .sheet :is(h1, h2, h3) { line-height: 1.3; }
    .sheet blockquote { border-left: 3px solid #d1d5db; margin-left: 0; padding-left: 1rem; color: #4b5563; }
    .sheet pre { background: #f3f4f6; padding: .75rem; border-radius: 6px; font-size: .85rem; overflow-x: auto; }
    .sheet a { color: #4338ca; }

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
      .sheet { padding: 1.25rem 1rem; }
      .words { display: none; }
    }
  `],
})
export class EditorComponent implements OnInit {
  private readonly conv = inject(ConversionService);
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);

  @ViewChild('sheet', { static: true }) private sheetRef!: ElementRef<HTMLDivElement>;

  readonly toolbar = TOOLBAR;
  readonly docName = signal('');
  readonly wordCount = signal(0);
  readonly importing = signal(false);
  readonly exporting = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);

  ngOnInit(): void {
    this.seo.update({
      title: 'Free Online Document Editor — Export to PDF & DOCX',
      description: 'Write and format documents in your browser, import Word files and export to PDF, DOCX or HTML. Free, no signup.',
      url: 'https://gentsallaku.it/dashboard/editor',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Free Online Document Editor',
      description: 'Write and format documents in the browser, import Word files and export to PDF, DOCX or HTML.',
      url: 'https://gentsallaku.it/dashboard/editor',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Rich text editing', 'Import Word (.docx)', 'Export to PDF/DOCX/HTML', 'Word count'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
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
  }

  // ── Import ───────────────────────────────────────────────────────────

  async importFile(e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;

    this.msg.set('');
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
      return;
    }

    const type: ConversionTypeId = format === 'pdf' ? 'html-to-pdf' : 'html-to-docx';
    const file = new File([html], `${name}.html`, { type: 'text/html' });

    this.exporting.set(true);
    this.msg.set('');
    this.msgOk.set(false);
    this.conv.convertFiles(type, [file]).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.Response && ev instanceof HttpResponse) {
          this.exporting.set(false);
          if (ev.body instanceof Blob) {
            this.download(ev.body, `${name}.${format}`);
            this.msg.set(`✅ ${this.t.instant('editor.success')}`);
            this.msgOk.set(true);
          } else {
            this.msg.set(`❌ ${this.t.instant('editor.err_export')}`);
          }
        }
      },
      error: () => {
        this.exporting.set(false);
        this.msg.set(`❌ ${this.t.instant('editor.err_export')}`);
      },
    });
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async importViaConversion(f: File, type: ConversionTypeId): Promise<void> {
    this.importing.set(true);
    this.conv.convertFiles(type, [f]).subscribe({
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
      error: () => {
        this.importing.set(false);
        this.msg.set(`❌ ${this.t.instant('editor.err_import')}`);
      },
    });
  }

  private setContent(html: string): void {
    this.sheetRef.nativeElement.innerHTML = html;
    this.onEdit();
  }

  /** Estrae il body e rimuove script/style/eventi inline dall'HTML importato. */
  private sanitizeHtml(raw: string): string {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script, style, link, meta, iframe, object, embed').forEach((el) => el.remove());
    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on') || (attr.name === 'href' && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      }
    }
    return doc.body.innerHTML;
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
