import { Component, HostListener, computed, effect, signal, inject, ElementRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';

interface NavItem {
  icon: string;
  labelKey: string;
  /** Chiave i18n opzionale con una breve spiegazione, mostrata come sottotitolo + tooltip. */
  descKey?: string;
  route: string;
}

interface NavGroup {
  id: string;
  emoji: string;
  titleKey: string;
  items: NavItem[];
}

// Le voci AI/Tools riusano le stesse chiavi i18n (tools.*) della pagina pubblica
// /dashboard/tools, così label e descrizioni restano coerenti e già tradotte.
const ADMIN_NAV: NavGroup[] = [
  {
    id: 'overview',
    emoji: '📊',
    titleKey: 'sidebar.group_overview',
    items: [
      { icon: '🏠', labelKey: 'nav.dashboard', route: '/dashboard' },
    ],
  },
  {
    id: 'content',
    emoji: '📝',
    titleKey: 'sidebar.group_content',
    items: [
      { icon: '🗂️', labelKey: 'nav.projects',     route: '/dashboard/projects' },
      { icon: '✍️', labelKey: 'nav.blog',          route: '/dashboard/blog' },
      { icon: '💼', labelKey: 'admin.experiences', route: '/dashboard/experiences' },
      { icon: '👤', labelKey: 'nav.about',         route: '/dashboard/about' },
    ],
  },
  {
    id: 'ai',
    emoji: '🧠',
    titleKey: 'tools.section_ai',
    items: [
      { icon: '📋', labelKey: 'tools.pdf_summary_title',   descKey: 'tools.pdf_summary_desc',   route: '/dashboard/pdf-summary' },
      { icon: '✨', labelKey: 'tools.ai_formatter_title',  descKey: 'tools.ai_formatter_desc',  route: '/dashboard/ai-formatter' },
      { icon: '🌐', labelKey: 'tools.pdf_translate_title', descKey: 'tools.pdf_translate_desc', route: '/dashboard/pdf-translate' },
      { icon: '🎞️', labelKey: 'tools.ai_slides_title',    descKey: 'tools.ai_slides_desc',     route: '/dashboard/ai-ppt' },
    ],
  },
  {
    id: 'tools',
    emoji: '🧰',
    titleKey: 'tools.section_tools',
    items: [
      { icon: '🖊️', labelKey: 'tools.pdf_editor_title', descKey: 'tools.pdf_editor_desc', route: '/dashboard/pdf-editor' },
      { icon: '👁',  labelKey: 'tools.viewer_title',     descKey: 'tools.viewer_desc',     route: '/dashboard/viewer' },
      { icon: '✏️', labelKey: 'tools.editor_title',      descKey: 'tools.editor_desc',     route: '/dashboard/editor' },
      { icon: '🔄', labelKey: 'tools.convert_title',     descKey: 'tools.convert_desc',    route: '/dashboard/convert' },
      { icon: '🔤', labelKey: 'tools.ocr_title',         descKey: 'tools.ocr_desc',        route: '/dashboard/ocr' },
      { icon: '📷', labelKey: 'tools.scanner_title',     descKey: 'tools.scanner_desc',    route: '/dashboard/scanner' },
    ],
  },
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslateModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly t = inject(TranslateService);

  readonly drawerOpen = this.drawer.drawerOpen;
  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());
  readonly navGroups = computed(() =>
    this.isAdminUser() ? ADMIN_NAV : ADMIN_NAV.filter(group => group.id !== 'overview' && group.id !== 'content'),
  );

  readonly searchQuery = signal('');

  // Filtra le voci per label/descrizione TRADOTTE (non per chiave), così la
  // ricerca funziona nella lingua che l'utente sta effettivamente leggendo.
  readonly visibleGroups = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.navGroups();
    return this.navGroups()
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          this.t.instant(item.labelKey).toLowerCase().includes(q) ||
          (item.descKey ? this.t.instant(item.descKey).toLowerCase().includes(q) : false),
        ),
      }))
      .filter(group => group.items.length > 0);
  });

  constructor(private auth: AuthService, private drawer: DrawerService, private elementRef: ElementRef<HTMLElement>) {
    // All'apertura il focus tastiera restava sul trigger dietro il backdrop
    // (quindi "sulla pagina"): lo sposta dentro il drawer, sul close-btn.
    effect(() => {
      if (this.drawerOpen()) {
        this.elementRef.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus();
      } else {
        this.searchQuery.set('');
      }
    });
  }

  closeDrawer(): void {
    this.drawer.close();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.drawer.close();
  }

  // Chiude il drawer quando si clicca fuori (backdrop-less click-outside),
  // ignorando i toggle della navbar che gestiscono già l'apertura/chiusura:
  // .nav-drawer-toggle (icona desktop) e .nav-item-mobile-drawer (voce nel
  // menu mobile) — senza questo, lo stesso click che apre il drawer da mobile
  // lo richiude subito in fase di bubbling su document.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.drawerOpen()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (this.elementRef.nativeElement.contains(target)) return;
    if (target.closest('.nav-drawer-toggle, .nav-item-mobile-drawer')) return;
    this.drawer.close();
  }

  // Chiude il drawer quando il focus (tastiera) esce dal sidebar.
  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    if (!this.drawerOpen()) return;
    const nextFocus = event.relatedTarget as HTMLElement | null;
    if (nextFocus && this.elementRef.nativeElement.contains(nextFocus)) return;
    this.drawer.close();
  }
}
