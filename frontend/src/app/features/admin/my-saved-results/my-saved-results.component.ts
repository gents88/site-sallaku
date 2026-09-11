import { Component, ChangeDetectionStrategy, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import {
  SavedResultsService,
  SavedResult,
  SavedResultListItem,
  SavedResultToolType,
} from '../../../core/services/saved-results.service';

const TOOL_ICON: Record<SavedResultToolType, string> = {
  'pdf-translate': '🌐',
  'ai-ppt': '🎞️',
  'ai-formatter': '✨',
  'pdf-summary': '📋',
  ocr: '🔤',
};

@Component({
  selector: 'app-my-saved-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, BreadcrumbComponent],
  templateUrl: './my-saved-results.component.html',
  styleUrls: ['./my-saved-results.component.scss'],
})
export class MySavedResultsComponent implements OnInit {
  private readonly seo = inject(SeoService);
  private readonly t = inject(TranslateService);
  private readonly savedResults = inject(SavedResultsService);
  readonly auth = inject(AuthService);
  readonly authModal = inject(AuthModalService);

  readonly toolIcon = TOOL_ICON;
  breadcrumbItems: BreadcrumbItem[] = [];

  readonly loading = signal(false);
  readonly items = signal<SavedResultListItem[]>([]);
  readonly expandedId = signal<string | null>(null);
  readonly expandedDetail = signal<SavedResult | null>(null);
  readonly detailLoading = signal(false);
  readonly errorMsg = signal('');

  constructor() {
    // Re-fetch whenever auth flips to logged-in (covers logging in from the
    // embedded modal without leaving this page), clear the list on logout.
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.fetchList();
      } else {
        this.items.set([]);
        this.expandedId.set(null);
        this.expandedDetail.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.seo.update({
      title: 'I miei file — Risultati salvati dai tool AI',
      description: 'Ritrova i file e i risultati che hai salvato dai tool AI di gentsallaku.it.',
      url: 'https://gentsallaku.it/lab/i-miei-file',
    });
    this.breadcrumbItems = [
      { label: this.t.instant('nav.home'), path: '/' },
      { label: this.t.instant('sidebar.lab'), path: '/lab' },
      { label: this.t.instant('sidebar.items.my_files') },
    ];
  }

  private fetchList(): void {
    this.loading.set(true);
    this.errorMsg.set('');
    this.savedResults.list().subscribe({
      next: (res) => {
        this.items.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set(this.t.instant('saved_results.save_error'));
      },
    });
  }

  toggle(item: SavedResultListItem): void {
    if (this.expandedId() === item.id) {
      this.expandedId.set(null);
      this.expandedDetail.set(null);
      return;
    }
    this.expandedId.set(item.id);
    this.expandedDetail.set(null);
    this.detailLoading.set(true);
    this.savedResults.get(item.id).subscribe({
      next: (full) => {
        this.expandedDetail.set(full);
        this.detailLoading.set(false);
      },
      error: () => {
        this.detailLoading.set(false);
      },
    });
  }

  remove(item: SavedResultListItem, event: Event): void {
    event.stopPropagation();
    if (!confirm(this.t.instant('saved_results.confirm_delete'))) return;
    this.savedResults.remove(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        if (this.expandedId() === item.id) {
          this.expandedId.set(null);
          this.expandedDetail.set(null);
        }
      },
    });
  }

  downloadPdf(detail: SavedResult, event: Event): void {
    event.stopPropagation();
    const base64 = detail.payload['pdfBase64'] as string | undefined;
    if (!base64) return;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `${detail.title}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  hasPdf(detail: SavedResult | null): boolean {
    return !!detail && typeof detail.payload['pdfBase64'] === 'string';
  }

  /** Best-effort plain-text rendering of an arbitrary tool payload for the expanded preview. */
  resultText(detail: SavedResult | null): string {
    if (!detail) return '';
    const p = detail.payload as Record<string, any>;
    if (typeof p['translatedText'] === 'string') return p['translatedText'];
    if (typeof p['formatted'] === 'string') return p['formatted'];
    if (typeof p['answer'] === 'string') return p['answer'];
    if (typeof p['longSummary'] === 'string') return p['longSummary'];
    if (typeof p['shortSummary'] === 'string') return p['shortSummary'];
    if (typeof p['text'] === 'string') return p['text'];
    if (Array.isArray(p['slides'])) {
      return p['slides']
        .map((s: any, i: number) => `${i + 1}. ${s.title ?? ''}\n${s.content ?? ''}`)
        .join('\n\n');
    }
    return JSON.stringify(detail.payload, null, 2);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
