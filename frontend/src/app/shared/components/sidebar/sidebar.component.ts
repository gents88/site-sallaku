import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

export interface NavItem {
  icon: string;
  label: string;
  route: string;
}

export interface NavGroup {
  id: string;
  emoji: string;
  title: string;
  items: NavItem[];
}

/** Tooltip della rail collassata: posizione calcolata dall'item sotto il puntatore/focus. */
interface RailTooltip {
  label: string;
  top: number;
}

export const ADMIN_NAV: NavGroup[] = [
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
      { icon: '⭐', label: 'Testimonials', route: '/dashboard/testimonials' },
      { icon: '💬', label: 'Notes',        route: '/dashboard/notes' },
    ],
  },
  {
    id: 'ai',
    emoji: '🧠',
    title: 'AI',
    items: [
      { icon: '🔎', label: 'Ricerca PDF',   route: '/lab/pdf-search' },
      { icon: '📚', label: 'Libreria',      route: '/lab/library' },
      { icon: '📋', label: 'PDF Summary',   route: '/lab/pdf-summary' },
      { icon: '✨', label: 'AI Formatter',  route: '/lab/ai-formatter' },
      { icon: '🌐', label: 'PDF Translate', route: '/lab/pdf-translate' },
      { icon: '🎞️', label: 'AI Slides',    route: '/lab/ai-ppt' },
    ],
  },
  {
    id: 'workspace',
    emoji: '🔗',
    title: 'Flusso di lavoro',
    items: [
      { icon: '🧩', label: 'Workspace', route: '/lab/workspace' },
    ],
  },
  {
    id: 'tools',
    emoji: '🧰',
    title: 'Tools',
    items: [
      { icon: '🖊️', label: 'Pagine PDF',      route: '/lab/pdf-editor' },
      { icon: '👁',  label: 'Viewer',          route: '/lab/viewer' },
      { icon: '✏️', label: 'Editor Documenti', route: '/lab/editor' },
      { icon: '🔄', label: 'Convert',          route: '/lab/convert' },
      { icon: '🔤', label: 'OCR',              route: '/lab/ocr' },
      { icon: '📷', label: 'Scanner',          route: '/lab/scanner' },
    ],
  },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LangUrlPipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);
  private readonly drawer = inject(DrawerService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly mode = this.drawer.mode;
  readonly drawerOpen = this.drawer.drawerOpen;
  readonly expanded = this.drawer.expanded;

  readonly tooltip = signal<RailTooltip | null>(null);

  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());
  readonly brandLabel = computed(() => (this.isAdminUser() ? 'Admin' : 'AI & Tools'));
  readonly brandBadge = computed(() => (this.isAdminUser() ? '⚙️' : '🧰'));
  readonly navGroups = computed(() =>
    this.isAdminUser() ? ADMIN_NAV : ADMIN_NAV.filter(group => group.id !== 'overview' && group.id !== 'content'),
  );

  /** Numero di voci realmente esposte: alimenta il testo del nudge senza hardcodarlo. */
  readonly itemCount = computed(() => this.navGroups().reduce((total, group) => total + group.items.length, 0));

  constructor() {
    // All'apertura del drawer overlay il focus tastiera restava sul trigger dietro
    // il backdrop (quindi "sulla pagina"): lo sposta dentro il drawer, sul close-btn.
    // In modalità rail non c'è nessuna trappola di focus da gestire.
    effect(() => {
      if (this.mode() === 'overlay' && this.drawerOpen()) {
        this.elementRef.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus();
      }
    });

    // La rail collassata non mostra etichette: se cambia stato mentre un tooltip
    // è visibile va scartato, altrimenti resta appeso sopra la colonna espansa.
    effect(() => {
      if (this.expanded() || this.mode() !== 'rail') this.tooltip.set(null);
    });
  }

  closeDrawer(): void {
    this.drawer.close();
  }

  toggleRail(): void {
    const next = !this.expanded();
    this.drawer.toggleRail();
    this.tooltip.set(null);
    this.analytics.trackClick('sidebar', next ? 'sidebar_rail_expand' : 'sidebar_rail_collapse');
  }

  /** Click su una voce: traccia la destinazione e, in overlay, chiude il drawer. */
  onNavigate(item: NavItem): void {
    this.analytics.trackClick(
      'sidebar_nav',
      `sidebar_${this.mode()}_${item.label.toLowerCase().replace(/\s+/g, '_')}`,
      item.route,
    );
    if (this.mode() === 'overlay') this.drawer.close();
  }

  showTooltip(event: Event, label: string): void {
    if (this.mode() !== 'rail' || this.expanded()) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    this.tooltip.set({ label, top: rect.top + rect.height / 2 });
  }

  hideTooltip(): void {
    this.tooltip.set(null);
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.tooltip.set(null);
    this.drawer.close();
  }

  // Chiude il drawer quando si clicca fuori (backdrop-less click-outside),
  // ignorando i toggle della navbar che gestiscono già l'apertura/chiusura:
  // .nav-drawer-toggle (trigger desktop/tablet) e .nav-item-mobile-drawer (voce
  // nel menu mobile) — senza questo, lo stesso click che apre il drawer da mobile
  // lo richiude subito in fase di bubbling su document.
  // In modalità rail non si applica: la colonna è parte del layout, non un overlay.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.mode() !== 'overlay' || !this.drawerOpen()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (this.elementRef.nativeElement.contains(target)) return;
    if (target.closest('.nav-drawer-toggle, .nav-item-mobile-drawer')) return;
    this.drawer.close();
  }

  // Chiude il drawer overlay quando il focus (tastiera) ne esce.
  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    this.tooltip.set(null);
    if (this.mode() !== 'overlay' || !this.drawerOpen()) return;
    const nextFocus = event.relatedTarget as HTMLElement | null;
    if (nextFocus && this.elementRef.nativeElement.contains(nextFocus)) return;
    this.drawer.close();
  }
}
