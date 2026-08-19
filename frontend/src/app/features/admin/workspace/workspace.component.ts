import { Component, ChangeDetectionStrategy, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService, WorkspaceKind } from '../../../core/services/workspace.service';

interface ToolLink {
  id: string;
  icon: string;
  route: string;
}

const FILE_CONSUMERS: ToolLink[] = [
  { id: 'pdf_summary',   icon: '📋',  route: '/lab/pdf-summary' },
  { id: 'pdf_translate', icon: '🌐',  route: '/lab/pdf-translate' },
  { id: 'ocr',           icon: '🔤',  route: '/lab/ocr' },
  { id: 'convert',       icon: '🔄',  route: '/lab/convert' },
  { id: 'pdf_editor',    icon: '🖊️', route: '/lab/pdf-editor' },
];

const TEXT_CONSUMERS: ToolLink[] = [
  { id: 'ai_formatter', icon: '✨', route: '/lab/ai-formatter' },
  { id: 'editor',       icon: '✏️', route: '/lab/editor' },
];

const STARTING_TOOLS: ToolLink[] = [
  { id: 'scanner',       icon: '📷',  route: '/lab/scanner' },
  { id: 'ocr',           icon: '🔤',  route: '/lab/ocr' },
  { id: 'convert',       icon: '🔄',  route: '/lab/convert' },
  { id: 'pdf_translate', icon: '🌐',  route: '/lab/pdf-translate' },
  { id: 'pdf_summary',   icon: '📋',  route: '/lab/pdf-summary' },
  { id: 'ai_formatter',  icon: '✨',  route: '/lab/ai-formatter' },
  { id: 'pdf_editor',    icon: '🖊️', route: '/lab/pdf-editor' },
];

@Component({
  selector: 'app-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
})
export class WorkspaceComponent implements OnInit {
  private readonly seo = inject(SeoService);
  readonly workspace = inject(WorkspaceService);

  readonly startingTools = STARTING_TOOLS;
  readonly justCleared = signal(false);

  readonly nextSteps = computed<ToolLink[]>(() => {
    const item = this.workspace.current();
    if (!item) return [];
    const pool = item.kind === 'file' ? FILE_CONSUMERS : TEXT_CONSUMERS;
    return pool.filter((t) => t.id !== item.fromTool);
  });

  ngOnInit(): void {
    this.seo.update({
      title: 'Workflow — Chain AI & PDF Tools Together',
      description: 'Send a file or text from one tool to the next without re-uploading. Scan, extract, translate and summarize in one connected flow.',
      url: 'https://gentsallaku.it/lab/workspace',
    });
  }

  kindLabel(kind: WorkspaceKind): string {
    return kind === 'file' ? 'workspace.kind_file' : 'workspace.kind_text';
  }

  downloadCurrent(): void {
    const item = this.workspace.peek();
    if (!item) return;
    if (item.kind === 'file' && item.blob) {
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(item.blob),
        download: item.filename,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (item.kind === 'text' && item.text) {
      const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: item.filename,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  clearCurrent(): void {
    this.workspace.clear();
    this.justCleared.set(true);
    setTimeout(() => this.justCleared.set(false), 1500);
  }

  timeAgo(ts: number): string {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }
}
