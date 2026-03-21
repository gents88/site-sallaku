import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { combineLatest, catchError, of, startWith } from 'rxjs';
import { ProjectsService } from '../../../core/services/projects.service';
import { ExperiencesService } from '../../../core/services/experiences.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

interface StatCard {
  labelKey: string;
  value: number;
  icon: string;
  route: string;
  color: string;
  miniBars: number[];
}

interface RecentContact {
  _id?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read?: boolean;
}

interface ChartBar {
  date: string;
  value: number;
}

interface AdminStatsResponse {
  users: number;
  contacts: number;
  recentContacts: RecentContact[];
  contactsByDay: Array<{ date: string; count: number }>;
  content: {
    total: number;
    published: number;
    drafts: number;
  };
  visits: {
    totalViews: number;
    uniqueVisitors: number;
    viewsByDay: Array<{ date: string; count: number }>;
  };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatIconModule, MatButtonModule, TranslateModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  stats: StatCard[] = [];
  recentContacts: RecentContact[] = [];
  contactBars: ChartBar[] = [];
  visitBars: ChartBar[] = [];
  publishedPosts = 0;
  draftPosts = 0;
  totalViews = 0;
  uniqueVisitors = 0;
  loading = true;
  logoutLoading = false;
  selectedContact: RecentContact | null = null;
  markingRead = false;
  deletingContact = false;
  actionMessageKey: string | null = null;
  private actionMessageTimeoutId: number | null = null;

  readonly quickLinks = [
    { labelKey: 'admin.manage_projects',    icon: 'work',       route: '/admin/projects' },
    { labelKey: 'admin.manage_experiences', icon: 'history_edu',route: '/admin/experiences' },
    { labelKey: 'admin.manage_blog',        icon: 'article',    route: '/admin/blog' },
    { labelKey: 'admin.edit_about',         icon: 'person',     route: '/admin/about' },
  ];

  constructor(
    public auth: AuthService,
    private projectsService: ProjectsService,
    private experiencesService: ExperiencesService,
    private http: HttpClient,
  ) {}

  ngOnInit(): void {
    const emptyStats: AdminStatsResponse = {
      users: 0,
      contacts: 0,
      recentContacts: [],
      contactsByDay: [],
      content: { total: 0, published: 0, drafts: 0 },
      visits: { totalViews: 0, uniqueVisitors: 0, viewsByDay: [] },
    };

    combineLatest({
      projects: this.projectsService.getAll().pipe(catchError(() => of([])), startWith([])),
      experiences: this.experiencesService.getAll().pipe(catchError(() => of([])), startWith([])),
      adminStats: this.http.get<AdminStatsResponse>(`${environment.apiUrl}/stats`).pipe(
        catchError(() => of(emptyStats)),
        startWith(emptyStats),
      ),
    }).subscribe({
      next: ({ projects, experiences, adminStats }) => {
        const totalPosts = adminStats.content.total;
        const publishedPosts = adminStats.content.published;
        const totalValues = [
          projects.length,
          experiences.length,
          totalPosts,
          publishedPosts,
          adminStats.contacts,
          adminStats.users,
          adminStats.visits.totalViews,
          adminStats.visits.uniqueVisitors,
        ];
        const maxValue = Math.max(...totalValues, 1);

        this.stats = [
          { labelKey: 'admin.projects',    value: projects.length,                       icon: 'work',                   route: '/admin/projects',    color: '#6366f1', miniBars: this.buildMiniBars(projects.length, maxValue, 0) },
          { labelKey: 'admin.experiences', value: experiences.length,                    icon: 'history_edu',            route: '/admin/experiences', color: '#06b6d4', miniBars: this.buildMiniBars(experiences.length, maxValue, 1) },
          { labelKey: 'admin.blog_posts',  value: totalPosts,                            icon: 'article',                route: '/admin/blog',        color: '#10b981', miniBars: this.buildMiniBars(totalPosts, maxValue, 2) },
          { labelKey: 'admin.published',   value: publishedPosts,                        icon: 'published_with_changes', route: '/admin/blog',        color: '#f59e0b', miniBars: this.buildMiniBars(publishedPosts, maxValue, 3) },
          { labelKey: 'admin.contacts',    value: adminStats.contacts,                   icon: 'mail',                   route: '/admin',             color: '#ec4899', miniBars: this.buildMiniBars(adminStats.contacts, maxValue, 4) },
          { labelKey: 'admin.users',       value: adminStats.users,                      icon: 'group',                  route: '/admin',             color: '#8b5cf6', miniBars: this.buildMiniBars(adminStats.users, maxValue, 5) },
          { labelKey: 'admin.visits',      value: adminStats.visits.totalViews,          icon: 'visibility',             route: '/admin',             color: '#14b8a6', miniBars: this.buildMiniBars(adminStats.visits.totalViews, maxValue, 6) },
          { labelKey: 'admin.visitors',    value: adminStats.visits.uniqueVisitors,      icon: 'monitoring',             route: '/admin',             color: '#ef4444', miniBars: this.buildMiniBars(adminStats.visits.uniqueVisitors, maxValue, 7) },
        ];
        this.recentContacts = adminStats.recentContacts;
        this.contactBars = adminStats.contactsByDay.map(item => ({ date: item.date, value: item.count }));
        this.visitBars = adminStats.visits.viewsByDay.map(item => ({ date: item.date, value: item.count }));
        this.publishedPosts = publishedPosts;
        this.draftPosts = adminStats.content.drafts;
        this.totalViews = adminStats.visits.totalViews;
        this.uniqueVisitors = adminStats.visits.uniqueVisitors;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get maxContactBarValue(): number {
    return Math.max(...this.contactBars.map(bar => bar.value), 1);
  }

  get maxVisitBarValue(): number {
    return Math.max(...this.visitBars.map(bar => bar.value), 1);
  }

  get totalContent(): number {
    return this.publishedPosts + this.draftPosts;
  }

  get publishedPercent(): number {
    return this.totalContent ? (this.publishedPosts / this.totalContent) * 100 : 0;
  }

  get draftPercent(): number {
    return this.totalContent ? (this.draftPosts / this.totalContent) * 100 : 0;
  }

  contactBarHeight(value: number): string {
    const percent = (value / this.maxContactBarValue) * 100;
    return `${Math.max(percent, value > 0 ? 18 : 8)}%`;
  }

  visitBarHeight(value: number): string {
    const percent = (value / this.maxVisitBarValue) * 100;
    return `${Math.max(percent, value > 0 ? 18 : 8)}%`;
  }

  async logout(): Promise<void> {
    if (this.logoutLoading) {
      return;
    }

    this.logoutLoading = true;

    try {
      await Promise.resolve(this.auth.logout());
    } catch {
      this.logoutLoading = false;
    }
  }

  openContact(contact: RecentContact): void {
    this.selectedContact = contact;

    if (!contact._id || contact.read) {
      return;
    }

    // Optimistic update: mark as read locally immediately so the "Nuovo" badge disappears
    const prevRead = contact.read;
    this.recentContacts = this.recentContacts.map(item => item._id === contact._id ? { ...item, read: true } : item);
    this.selectedContact = { ...contact, read: true };

    // Fire-and-forget mark-read request; don't toggle `markingRead` here so the
    // spinner appears only when the user explicitly clicks the "mark read" button.
    this.http.patch<RecentContact>(`${environment.apiUrl}/contact/${contact._id}/read`, {}).subscribe({
      next: (updatedContact) => {
        this.recentContacts = this.recentContacts.map(item => item._id === updatedContact._id ? updatedContact : item);
        this.selectedContact = updatedContact;
      },
      error: () => {
        // revert optimistic change on error
        this.recentContacts = this.recentContacts.map(item => item._id === contact._id ? { ...item, read: prevRead } : item);
        this.selectedContact = { ...contact, read: prevRead };
      },
    });
  }

  closeContact(): void {
    this.selectedContact = null;
    this.markingRead = false;
    this.deletingContact = false;
  }

  setSelectedContactReadState(read: boolean): void {
    if (!this.selectedContact?._id || this.markingRead) {
      return;
    }

    this.markingRead = true;
    this.http.patch<RecentContact>(`${environment.apiUrl}/contact/${this.selectedContact._id}/read`, { read }).subscribe({
      next: (updatedContact) => {
        this.recentContacts = this.recentContacts.map(item => item._id === updatedContact._id ? updatedContact : item);
        this.selectedContact = updatedContact;
        this.markingRead = false;
        this.showActionMessage(read ? 'admin.marked_read' : 'admin.marked_unread');
      },
      error: () => {
        this.markingRead = false;
      },
    });
  }

  deleteSelectedContact(): void {
    if (!this.selectedContact?._id || this.deletingContact || typeof window === 'undefined') {
      return;
    }

    const shouldDelete = window.confirm('Vuoi eliminare definitivamente questo messaggio?');
    if (!shouldDelete) {
      return;
    }

    const contactId = this.selectedContact._id;
    this.deletingContact = true;

    this.http.delete<{ success: boolean }>(`${environment.apiUrl}/contact/${contactId}`).subscribe({
      next: () => {
        this.recentContacts = this.recentContacts.filter(item => item._id !== contactId);
        this.stats = this.stats.map(stat => stat.labelKey === 'admin.contacts'
          ? { ...stat, value: Math.max(stat.value - 1, 0) }
          : stat,
        );
        this.closeContact();
        this.showActionMessage('admin.message_deleted');
      },
      error: () => {
        this.deletingContact = false;
      },
    });
  }

  replyToSelectedContact(): void {
    if (!this.selectedContact || typeof window === 'undefined') {
      return;
    }

    const subject = encodeURIComponent(`Re: ${this.selectedContact.subject}`);
    window.location.href = `mailto:${this.selectedContact.email}?subject=${subject}`;
  }

  private buildMiniBars(value: number, maxValue: number, seed: number): number[] {
    const normalized = maxValue ? value / maxValue : 0;
    const pattern = [0.42, 0.68, 0.54, 0.82, 0.61, 0.9];

    return pattern.map((point, index) => {
      const offset = ((seed + index) % 3) * 4;
      const height = 16 + normalized * 42 + point * 30 + offset;
      return Math.max(18, Math.min(Math.round(height), 92));
    });
  }

  private showActionMessage(messageKey: string): void {
    this.actionMessageKey = messageKey;

    if (this.actionMessageTimeoutId !== null) {
      window.clearTimeout(this.actionMessageTimeoutId);
    }

    this.actionMessageTimeoutId = window.setTimeout(() => {
      this.actionMessageKey = null;
      this.actionMessageTimeoutId = null;
    }, 2600);
  }

}
