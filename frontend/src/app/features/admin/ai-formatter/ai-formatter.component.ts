import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
  computed,
  inject,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  AiFormatterService,
  DocType,
  FormatTextResult,
} from '../../../core/services/ai-formatter.service';

type ViewMode = 'formatted' | 'raw';

@Component({
  selector: 'app-ai-formatter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './ai-formatter.component.html',
  styleUrls: ['./ai-formatter.component.scss'],
})
export class AiFormatterComponent implements OnInit {
  @ViewChild('formatterSection') formatterSection!: ElementRef<HTMLElement>;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly service   = inject(AiFormatterService);
  private readonly seo       = inject(SeoService);

  ngOnInit(): void {
    this.seo.update({
      title: 'AI Text Formatter — Convert Notes to Polished Documents',
      description: 'Transform unformatted text, meeting notes or raw AI content into structured professional documents instantly. Supports reports, proposals, résumés, articles and more. Free online AI formatter.',
      url: 'https://gentsallaku.it/dashboard/ai-formatter',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'AI Document Formatter',
      description: 'Transform raw text and notes into structured professional documents with AI. Supports reports, proposals, résumés and more.',
      url: 'https://gentsallaku.it/dashboard/ai-formatter',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: ['Instant formatting', 'Smart structure detection', '6 document types', 'Markdown output', 'Live preview'],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  readonly loading = this.service.isLoading;

  readonly text             = signal('');
  readonly result           = signal<FormatTextResult | null>(null);
  readonly error            = signal('');
  readonly viewMode         = signal<ViewMode>('formatted');
  readonly isDragging       = signal(false);
  readonly selectedDocType  = signal<DocType>('general');
  readonly copied           = signal(false);

  readonly wordCount = computed(() =>
    this.text().trim() ? this.text().trim().split(/\s+/).filter(Boolean).length : 0,
  );
  readonly charCount = computed(() => this.text().length);

  readonly renderedHtml = computed<SafeHtml>(() => {
    const r = this.result();
    if (!r) return '';
    return this.sanitizer.bypassSecurityTrustHtml(this.markdownToHtml(r.formatted));
  });

  readonly docTypes: Array<{ value: DocType; labelKey: string; icon: string }> = [
    { value: 'general',           labelKey: 'ai_formatter.doctype_general',           icon: '📄' },
    { value: 'business_proposal', labelKey: 'ai_formatter.doctype_business_proposal', icon: '💼' },
    { value: 'report',            labelKey: 'ai_formatter.doctype_report',            icon: '📊' },
    { value: 'meeting_notes',     labelKey: 'ai_formatter.doctype_meeting_notes',     icon: '📝' },
    { value: 'resume',            labelKey: 'ai_formatter.doctype_resume',            icon: '👤' },
    { value: 'article',           labelKey: 'ai_formatter.doctype_article',           icon: '✍️' },
  ];

  readonly features = [
    { icon: '⚡', titleKey: 'ai_formatter.feature_instant_title', descKey: 'ai_formatter.feature_instant_desc' },
    { icon: '🧠', titleKey: 'ai_formatter.feature_smart_title',   descKey: 'ai_formatter.feature_smart_desc' },
    { icon: '📋', titleKey: 'ai_formatter.feature_multiple_title', descKey: 'ai_formatter.feature_multiple_desc' },
    { icon: '🔄', titleKey: 'ai_formatter.feature_preview_title', descKey: 'ai_formatter.feature_preview_desc' },
  ];

  format(): void {
    const rawText = this.text().trim();
    if (!rawText || rawText.length < 10) {
      this.error.set('Please enter at least 10 characters of text to format.');
      return;
    }
    this.error.set('');
    this.result.set(null);

    this.service.formatText({ text: rawText, docType: this.selectedDocType() }).subscribe({
      next: (res) => this.result.set(res),
      error: (err) => {
        const msg = err?.error?.message ?? 'An error occurred. Please try again.';
        this.error.set(Array.isArray(msg) ? msg.join(' ') : msg);
      },
    });
  }

  setViewMode(mode: ViewMode): void { this.viewMode.set(mode); }
  setDocType(type: DocType): void   { this.selectedDocType.set(type); }

  scrollToFormatter(): void {
    this.formatterSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.isDragging.set(true); }
  onDragLeave(): void { this.isDragging.set(false); }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readFileAsText(file);
  }
  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.readFileAsText(file);
    (event.target as HTMLInputElement).value = '';
  }

  private readFileAsText(file: File): void {
    const ok = ['text/plain', 'text/markdown', 'text/csv'];
    if (!ok.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      this.error.set('Only .txt or .md files are supported for quick paste.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.text.set(e.target?.result as string);
      this.error.set('');
    };
    reader.readAsText(file);
  }

  copyToClipboard(): void {
    const r = this.result();
    if (!r) return;
    navigator.clipboard.writeText(r.formatted).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  clearAll(): void {
    this.text.set('');
    this.result.set(null);
    this.error.set('');
  }

  useSampleText(): void {
    this.text.set(
`Q1 Business Review Meeting Notes

Attendees: Sarah (CEO), Mike (CTO), Anna (Sales), James (Marketing)
Date: March 28, 2026
Duration: 2 hours

Revenue Update
We closed Q1 with 2.3M in revenue, up 18% from last quarter. Enterprise accounts now represent 62% of total revenue. Three major deals were closed in the final week of March.

Product Updates
The mobile app beta launched on March 15 with 400 beta testers. Early feedback is positive with an average rating of 4.2/5. Key features requested by users: offline mode, dark theme, export to PDF.

Action Items
- Sarah to finalize Series B term sheet by April 10
- Mike to deliver mobile app v1.0 by April 30
- Anna to expand enterprise sales team to 5 by end of Q2
- James to launch new brand campaign in May

Next Steps
Full team offsite planned for April 5-6 in Milan. Q2 targets to be circulated via email by April 3.`,
    );
    this.error.set('');
  }

  private markdownToHtml(md: string): string {
    const lines = md.split('\n');
    const out: string[] = [];
    let inUl = false;
    let inOl = false;

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    };

    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inline = (s: string) =>
      esc(s)
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,         '<em>$1</em>')
        .replace(/`([^`]+)`/g,         '<code>$1</code>');

    for (const raw of lines) {
      const t = raw.trim();
      if (!t) { closeList(); out.push('<br>'); continue; }
      if      (t.startsWith('#### ')) { closeList(); out.push(`<h4>${inline(t.slice(5))}</h4>`); }
      else if (t.startsWith('### '))  { closeList(); out.push(`<h3>${inline(t.slice(4))}</h3>`); }
      else if (t.startsWith('## '))   { closeList(); out.push(`<h2>${inline(t.slice(3))}</h2>`); }
      else if (t.startsWith('# '))    { closeList(); out.push(`<h1>${inline(t.slice(2))}</h1>`); }
      else if (t === '---' || t === '***') { closeList(); out.push('<hr>'); }
      else if (t.startsWith('> '))    { closeList(); out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`); }
      else if (/^[-*] /.test(t)) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${inline(t.slice(2))}</li>`);
      } else if (/^\d+[.)]\s/.test(t)) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${inline(t.replace(/^\d+[.)]\s+/, ''))}</li>`);
      } else {
        closeList();
        out.push(`<p>${inline(t)}</p>`);
      }
    }

    closeList();
    return out.join('\n');
  }
}
