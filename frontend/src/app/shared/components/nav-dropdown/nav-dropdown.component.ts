import {
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface NavItem {
  readonly label: string;
  readonly route: string;
  readonly icon: string;
  readonly exact?: boolean;
}

interface NavGroup {
  readonly id: string;
  readonly title: string;
  readonly emoji: string;
  readonly items: ReadonlyArray<NavItem>;
}

/**
 * Navigation groups mirroring the source project's ShellComponent sidebar groups.
 * AI items map to AI-powered features; Tools items map to content-management admin tools.
 */
const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: 'ai',
    title: 'AI',
    emoji: '🧠',
    items: [
      { label: 'PDF Summary',   route: '/dashboard/pdf-summary',   icon: '📋' },
      { label: 'AI Formatter',  route: '/dashboard/ai-formatter',  icon: '✨' },
      { label: 'PDF Translate', route: '/dashboard/pdf-translate', icon: '🌐' },
      { label: 'AI Slides',     route: '/dashboard/ai-ppt',        icon: '🎞️' },
    ],
  },
  {
    id: 'tools',
    title: 'Tools',
    emoji: '🧰',
    items: [
      { label: 'PDF Editor', route: '/dashboard/pdf-editor', icon: '🖊️' },
      { label: 'Viewer',     route: '/dashboard/viewer',     icon: '👁' },
      { label: 'Editor',     route: '/dashboard/editor',     icon: '✏️' },
      { label: 'Convert',    route: '/dashboard/convert',    icon: '🔄' },
      { label: 'OCR',        route: '/dashboard/ocr',        icon: '🔤' },
      { label: 'Scanner',    route: '/dashboard/scanner',    icon: '📷' },
    ],
  },
];

/**
 * Dropdown menu component providing access to AI and Tools sections.
 * Adapted from gestionale-pdf/frontend ShellComponent sidebar group pattern.
 * Visible only on desktop (hidden on mobile via :host media query).
 */
@Component({
  selector: 'app-nav-dropdown',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <div class="ndd-wrapper">
      <button
        type="button"
        class="ndd-trigger"
        [class.ndd-trigger--open]="isOpen()"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="menu"
        (click)="toggle()"
      >
        <span class="ndd-trigger__label">AI &amp; Tools</span>
        <mat-icon class="ndd-trigger__icon" aria-hidden="true">expand_more</mat-icon>
      </button>

      @if (isOpen()) {
        <div class="ndd-panel" role="menu" aria-label="AI and Tools navigation">
          @for (group of groups; track group.id; let last = $last) {
            <div class="ndd-group">
              <div class="ndd-group__label">
                <span aria-hidden="true">{{ group.emoji }}</span>
                {{ group.title }}
              </div>
              @for (item of group.items; track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="ndd-item--active"
                  [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                  class="ndd-item"
                  role="menuitem"
                  (click)="close()"
                >
                  <span class="ndd-item__icon" aria-hidden="true">{{ item.icon }}</span>
                  <span>{{ item.label }}</span>
                </a>
              }
            </div>
            @if (!last) {
              <div class="ndd-divider" role="separator"></div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: relative;
    }

    /* Hide on mobile — the mobile drawer in the navbar handles navigation */
    @media (max-width: 900px) {
      :host { display: none; }
    }

    /* ── Trigger button ─────────────────────────────────────────────────────── */
    .ndd-trigger {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 8px 12px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary, #8892b0);
      background: transparent;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.2s ease, background 0.2s ease;
      outline: 2px solid transparent;
      outline-offset: 2px;
    }

    .ndd-trigger:hover,
    .ndd-trigger--open {
      color: var(--text-primary, #f0f4ff);
      background: rgba(79, 106, 245, 0.1);
    }

    .ndd-trigger:focus-visible {
      outline: 2px solid var(--primary-500, #4f6af5);
    }

    .ndd-trigger__label {
      line-height: 1;
    }

    .ndd-trigger__icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      transition: transform 0.2s ease;
    }

    .ndd-trigger--open .ndd-trigger__icon {
      transform: rotate(180deg);
    }

    /* ── Dropdown panel ─────────────────────────────────────────────────────── */
    .ndd-panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 500;
      min-width: 210px;
      background: var(--surface-overlay, rgba(15, 23, 42, 0.97));
      border: 1px solid var(--glass-border, rgba(148, 163, 184, 0.1));
      border-radius: 10px;
      padding: 6px;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.45),
        0 0 0 1px rgba(148, 163, 184, 0.08);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      animation: nddIn 0.15s ease-out;
    }

    @keyframes nddIn {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
    }

    /* ── Group label ────────────────────────────────────────────────────────── */
    .ndd-group__label {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 8px 10px 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.9px;
      text-transform: uppercase;
      color: var(--text-muted, #6e7681);
      user-select: none;
    }

    /* ── Nav item ───────────────────────────────────────────────────────────── */
    .ndd-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.75rem;
      border-radius: 6px;
      color: var(--text-secondary, #8b949e);
      text-decoration: none;
      font-size: 0.875rem;
      transition: background 0.15s, color 0.15s;
      cursor: pointer;
      white-space: nowrap;
    }

    .ndd-item:hover {
      background: rgba(108, 99, 255, 0.1);
      color: var(--text-primary, #e6edf3);
    }

    .ndd-item:focus-visible {
      outline: 2px solid var(--primary-500, #4f6af5);
      outline-offset: 1px;
    }

    .ndd-item--active {
      background: rgba(108, 99, 255, 0.15);
      color: var(--accent, #6c63ff);
      font-weight: 500;
    }

    .ndd-item__icon {
      font-size: 1rem;
      width: 20px;
      text-align: center;
      flex-shrink: 0;
    }

    /* ── Divider ────────────────────────────────────────────────────────────── */
    .ndd-divider {
      height: 1px;
      background: var(--glass-border, rgba(148, 163, 184, 0.1));
      margin: 4px 6px;
    }
  `],
})
export class NavDropdownComponent {
  readonly groups = NAV_GROUPS;
  readonly isOpen = signal(false);

  private readonly elementRef = inject(ElementRef<HTMLElement>);

  toggle(): void {
    this.isOpen.update(v => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
