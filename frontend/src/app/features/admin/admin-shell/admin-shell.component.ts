import { Component, HostListener, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';

interface NavItem {
  icon: string;
  label: string;
  route: string;
}

interface NavGroup {
  id: string;
  emoji: string;
  title: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    id: 'overview',
    emoji: '📊',
    title: 'Overview',
    items: [
      { icon: '🏠', label: 'Dashboard', route: '/dashboard' },
    ],
  },
  {
    id: 'content',
    emoji: '📝',
    title: 'Content',
    items: [
      { icon: '🗂️', label: 'Projects',    route: '/dashboard/projects' },
      { icon: '✍️', label: 'Blog',         route: '/dashboard/blog' },
      { icon: '💼', label: 'Experiences',  route: '/dashboard/experiences' },
      { icon: '👤', label: 'About',        route: '/dashboard/about' },
    ],
  },
  {
    id: 'ai',
    emoji: '🧠',
    title: 'AI',
    items: [
      { icon: '📋', label: 'PDF Summary',   route: '/dashboard/pdf-summary' },
      { icon: '✨', label: 'AI Formatter',  route: '/dashboard/ai-formatter' },
      { icon: '🌐', label: 'PDF Translate', route: '/dashboard/pdf-translate' },
      { icon: '🎞️', label: 'AI Slides',    route: '/dashboard/ai-ppt' },
    ],
  },
  {
    id: 'tools',
    emoji: '🧰',
    title: 'Tools',
    items: [
      { icon: '🖊️', label: 'PDF Editor', route: '/dashboard/pdf-editor' },
      { icon: '👁',  label: 'Viewer',     route: '/dashboard/viewer' },
      { icon: '✏️', label: 'Editor',      route: '/dashboard/editor' },
      { icon: '🔄', label: 'Convert',     route: '/dashboard/convert' },
      { icon: '🔤', label: 'OCR',         route: '/dashboard/ocr' },
      { icon: '📷', label: 'Scanner',     route: '/dashboard/scanner' },
    ],
  },
];

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <!-- Mobile topbar with LEFT hamburger -->
    <div class="admin-topbar">
      <button
        class="hamburger-btn"
        type="button"
        [attr.aria-expanded]="drawerOpen()"
        aria-controls="admin-drawer"
        aria-label="Open navigation menu"
        (click)="toggleDrawer()"
      >
        <span></span><span></span><span></span>
      </button>
      <span class="admin-topbar-title">Admin</span>
    </div>

    <div class="admin-shell">
      <!-- Overlay for mobile drawer -->
      @if (drawerOpen()) {
        <div class="drawer-overlay" (click)="closeDrawer()" aria-hidden="true"></div>
      }

      <!-- Left sidebar (desktop) / drawer (mobile) -->
      <aside
        id="admin-drawer"
        class="admin-sidebar"
        [class.open]="drawerOpen()"
        role="navigation"
        aria-label="Admin navigation"
      >
        <div class="sidebar-header">
          <span class="sidebar-brand">⚙️ Admin</span>
          <button class="close-btn" type="button" aria-label="Close menu" (click)="closeDrawer()">✕</button>
        </div>

        <nav class="sidebar-nav">
          @for (group of navGroups; track group.id) {
            <div class="nav-group">
              <div class="nav-group-label">{{ group.emoji }} {{ group.title }}</div>
              @for (item of group.items; track item.route) {
                <a
                  [routerLink]="item.route"
                  routerLinkActive="active"
                  [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
                  class="nav-item"
                  (click)="closeDrawer()"
                >
                  <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
                  <span>{{ item.label }}</span>
                </a>
              }
            </div>
          }
        </nav>
      </aside>

      <!-- Main content -->
      <main class="admin-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    /* Push everything below the fixed site navbar (~72px) */
    :host { display: block; padding-top: 72px; }

    /* ─── Mobile topbar (hidden on desktop) ─────────────────────────── */
    .admin-topbar {
      display: none;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      background: var(--bg-secondary, #161b22);
      border-bottom: 1px solid var(--border-color, #30363d);
      position: sticky;
      top: 72px;
      z-index: 110;
    }

    .admin-topbar-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--text-primary, #e6edf3);
    }

    .hamburger-btn {
      width: 40px;
      height: 40px;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      background: transparent;
      border: 1px solid var(--border-color, #30363d);
      border-radius: 8px;
      cursor: pointer;
      color: var(--text-primary, #e6edf3);
      flex-shrink: 0;

      span {
        width: 16px;
        height: 2px;
        border-radius: 2px;
        background: currentColor;
        display: block;
      }
    }

    /* ─── Shell layout ───────────────────────────────────────────────── */
    .admin-shell {
      display: flex;
      min-height: calc(100vh - 72px);
    }

    /* ─── Overlay ────────────────────────────────────────────────────── */
    .drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 118;
      background: rgba(2, 6, 23, 0.65);
      backdrop-filter: blur(2px);
    }

    /* ─── Sidebar ────────────────────────────────────────────────────── */
    .admin-sidebar {
      width: 220px;
      flex-shrink: 0;
      background: var(--bg-secondary, #161b22);
      border-right: 1px solid var(--border-color, #30363d);
      padding: 1rem 0.75rem;
      position: sticky;
      top: 72px;
      height: calc(100vh - 72px);
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--border-color, #30363d) transparent;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
      padding: 0 0.25rem;
    }

    .sidebar-brand {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary, #e6edf3);
    }

    .close-btn {
      display: none;
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-color, #30363d);
      border-radius: 7px;
      background: transparent;
      color: var(--text-secondary, #8b949e);
      font-size: 0.9rem;
      cursor: pointer;
      align-items: center;
      justify-content: center;

      &:hover {
        background: rgba(248, 81, 73, 0.1);
        color: #f87171;
        border-color: #f87171;
      }
    }

    /* ─── Nav groups ─────────────────────────────────────────────────── */
    .sidebar-nav {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .nav-group {
      margin-bottom: 0.5rem;
    }

    .nav-group-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.9px;
      text-transform: uppercase;
      color: var(--text-muted, #6e7681);
      padding: 0.6rem 0.5rem 0.25rem;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.65rem;
      border-radius: 8px;
      color: var(--text-secondary, #8b949e);
      text-decoration: none;
      font-size: 0.85rem;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &:hover {
        background: rgba(108, 99, 255, 0.1);
        color: var(--text-primary, #e6edf3);
      }

      &.active {
        background: rgba(108, 99, 255, 0.15);
        color: #a78bfa;
        font-weight: 600;
      }
    }

    .nav-icon {
      font-size: 1rem;
      width: 20px;
      text-align: center;
      flex-shrink: 0;
    }

    /* ─── Main content ───────────────────────────────────────────────── */
    .admin-main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }

    /* ─── Responsive ─────────────────────────────────────────────────── */
    @media (max-width: 900px) {
      :host { padding-top: 0; }

      .admin-topbar { display: flex; }

      .admin-shell { min-height: calc(100vh - 72px); }

      .drawer-overlay { display: block; }

      .admin-sidebar {
        position: fixed;
        top: 72px;
        left: 0;
        height: calc(100dvh - 72px);
        z-index: 119;
        width: min(80vw, 260px);
        transform: translateX(-104%);
        transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);

        &.open { transform: translateX(0); }
      }

      .close-btn { display: flex; }
    }
  `],
})
export class AdminShellComponent {
  readonly drawerOpen = signal(false);
  readonly navGroups = ADMIN_NAV;

  constructor(private router: Router) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen.set(false));
  }

  toggleDrawer(): void {
    this.drawerOpen.update(v => !v);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.drawerOpen.set(false);
  }
}
