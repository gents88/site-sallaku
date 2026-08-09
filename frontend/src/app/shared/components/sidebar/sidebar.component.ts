import { Component, HostListener, computed } from '@angular/core';
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

  constructor(private auth: AuthService, private drawer: DrawerService) {}

  closeDrawer(): void {
    this.drawer.close();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.drawer.close();
  }
}
