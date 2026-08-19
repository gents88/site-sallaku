import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { ADMIN_NAV, NavItem } from '../sidebar/sidebar.component';

interface PaletteItem extends NavItem {
  group: string;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  template: `
    @if (open()) {
      <div class="cp-backdrop" (click)="close()"></div>
      <div class="cp-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="cp-input-row">
          <span class="cp-input-icon">🔎</span>
          <input
            #input
            type="text"
            class="cp-input"
            placeholder="Vai a..."
            [value]="query()"
            (input)="onQuery($event)"
            (keydown.arrowdown)="move(1); $event.preventDefault()"
            (keydown.arrowup)="move(-1); $event.preventDefault()"
            (keydown.enter)="select(activeIndex()); $event.preventDefault()"
          />
          <kbd class="cp-esc">Esc</kbd>
        </div>
        @if (filtered().length) {
          <ul class="cp-list">
            @for (item of filtered(); track item.route; let i = $index) {
              <li>
                <button
                  type="button"
                  class="cp-item"
                  [class.active]="i === activeIndex()"
                  (mouseenter)="activeIndex.set(i)"
                  (click)="select(i)"
                >
                  <span class="cp-item-icon">{{ item.icon }}</span>
                  <span class="cp-item-label">{{ item.label }}</span>
                  <span class="cp-item-group">{{ item.group }}</span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="cp-empty">Nessun risultato</div>
        }
      </div>
    }
  `,
  styles: [`
    .cp-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      z-index: 900; backdrop-filter: blur(2px);
    }
    .cp-panel {
      position: fixed; top: 14vh; left: 50%; transform: translateX(-50%);
      width: min(560px, 92vw); max-height: 60vh;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d);
      border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.45);
      z-index: 901; overflow: hidden; display: flex; flex-direction: column;
    }
    .cp-input-row {
      display: flex; align-items: center; gap: .6rem;
      padding: .9rem 1.1rem; border-bottom: 1px solid var(--border-color, #30363d);
    }
    .cp-input-icon { font-size: .95rem; opacity: .7; }
    .cp-input {
      flex: 1; background: transparent; border: none; outline: none;
      color: var(--text-primary, #e6edf3); font-size: .95rem;
    }
    .cp-esc {
      font-size: .68rem; color: var(--text-muted, #6e7681);
      border: 1px solid var(--border-color, #30363d); border-radius: 5px;
      padding: .1rem .4rem;
    }
    .cp-list { list-style: none; margin: 0; padding: .4rem; overflow-y: auto; }
    .cp-item {
      display: flex; align-items: center; gap: .7rem; width: 100%;
      padding: .55rem .7rem; border-radius: 9px; border: none;
      background: transparent; color: var(--text-primary, #e6edf3);
      text-align: left; cursor: pointer; font-size: .88rem;
      &.active, &:hover { background: rgba(108,99,255,.12); }
    }
    .cp-item-icon { flex-shrink: 0; }
    .cp-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cp-item-group { font-size: .72rem; color: var(--text-secondary, #8b949e); flex-shrink: 0; }
    .cp-empty { padding: 1.5rem; text-align: center; color: var(--text-secondary, #8b949e); font-size: .85rem; }
  `],
})
export class CommandPaletteComponent {
  @ViewChild('input') inputRef?: ElementRef<HTMLInputElement>;

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsTrackingService);

  readonly open = signal(false);
  readonly query = signal('');
  readonly activeIndex = signal(0);

  private readonly items = computed<PaletteItem[]>(() => {
    const isAdmin = this.auth.isLoggedIn() && this.auth.isAdmin();
    const groups = isAdmin ? ADMIN_NAV : ADMIN_NAV.filter((g) => g.id !== 'overview' && g.id !== 'content');
    return groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g.title })));
  });

  readonly filtered = computed<PaletteItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.items();
    if (!q) return all;
    return all.filter((it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q));
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.query.set('');
        this.activeIndex.set(0);
        queueMicrotask(() => this.inputRef?.nativeElement?.focus());
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
    if (isCmdK) {
      event.preventDefault();
      this.open.update((v) => !v);
      if (this.open()) this.analytics.trackClick('command_palette', 'command_palette_open');
      return;
    }
    if (event.key === 'Escape' && this.open()) {
      this.close();
    }
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  move(delta: number): void {
    const len = this.filtered().length;
    if (!len) return;
    this.activeIndex.update((i) => (i + delta + len) % len);
  }

  select(index: number): void {
    const item = this.filtered()[index];
    if (!item) return;
    this.analytics.trackClick('command_palette', 'command_palette_navigate', item.route);
    this.router.navigateByUrl(item.route);
    this.close();
  }

  close(): void {
    this.open.set(false);
  }
}
