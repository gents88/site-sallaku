import { Component, HostListener, computed, effect, ElementRef } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';

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
      { icon: '⭐', label: 'Testimonials', route: '/dashboard/testimonials' },
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
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly drawerOpen = this.drawer.drawerOpen;
  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());
  readonly navGroups = computed(() =>
    this.isAdminUser() ? ADMIN_NAV : ADMIN_NAV.filter(group => group.id !== 'overview' && group.id !== 'content'),
  );

  constructor(private auth: AuthService, private drawer: DrawerService, private elementRef: ElementRef<HTMLElement>) {
    // All'apertura il focus tastiera restava sul trigger dietro il backdrop
    // (quindi "sulla pagina"): lo sposta dentro il drawer, sul close-btn.
    effect(() => {
      if (this.drawerOpen()) {
        this.elementRef.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus();
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
