import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { combineLatest, catchError, of, startWith, Subscription } from 'rxjs';
import { ProjectsService } from '../../../core/services/projects.service';
import { ExperiencesService } from '../../../core/services/experiences.service';
import { AuthService } from '../../../core/services/auth.service';
import { BlogService } from '../../../core/services/blog.service';
import { Post } from '../../../core/models/post.model';
import { DonutChartComponent, DonutItem } from '../../../shared/components/donut-chart/donut-chart.component';
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
  unreadContacts: number;
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

interface AdvancedAnalytics {
  todayCount: number;
  topLocations: DonutItem[];
  topCountries: DonutItem[];
  deviceBreakdown: DonutItem[];
  browserBreakdown: DonutItem[];
  osBreakdown: DonutItem[];
  trafficSources: DonutItem[];
}

interface AnalyticsStats {
  totalViews: number;
  monthlyViews: number;
  locations: DonutItem[];
  monthlyLocations: DonutItem[];
  devices: DonutItem[];
  monthlyDevices: DonutItem[];
  lastResetAt: string | null;
}

interface TopPage { label: string; count: number; }

interface MonthlyHistoryEntry { month: string; views: number; }

interface AuditLogEntry {
  _id?: string;
  actorEmail: string;
  method: string;
  path: string;
  resource: string;
  description: string;
  statusCode: number;
  createdAt: string;
}

interface ChatbotStats {
  totalSessions: number;
  totalMessages: number;
  interactionsToday: number;
  sessionsThisMonth: number;
}

interface SystemHealth {
  ok: boolean;
  service: string;
  version: string;
  startedAt: string;
  environment: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatbotSession {
  sessionId: string;
  messages: ChatMessage[];
  lastActivity: string;
  createdAt: string;
  messageCount: number;
}

interface ChatbotSessionsPage {
  data: ChatbotSession[];
  total: number;
  page: number;
  totalPages: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatCardModule, MatIconModule, MatButtonModule, TranslateModule, DonutChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  stats: StatCard[] = [];
  recentContacts: RecentContact[] = [];
  contactBars: ChartBar[] = [];
  visitBars: ChartBar[] = [];
  publishedPosts = 0;
  draftPosts = 0;
  totalViews = 0;
  uniqueVisitors = 0;
  todayVisitors = 0;
  loading = true;
  logoutLoading = false;
  unreadCount = 0;
  selectedContact: RecentContact | null = null;
  markingRead = false;
  deletingContact = false;
  actionMessageKey: string | null = null;
  private actionMessageTimeoutId: number | null = null;

  topPosts: Post[] = [];

  // Multi-select state
  selectedIds = new Set<string>();
  bulkDeleting = false;

  // Confirm dialog
  confirmDialog: {
    visible: boolean;
    messageKey: string;
    messageParams: Record<string, unknown>;
    onConfirm: (() => void) | null;
  } = { visible: false, messageKey: '', messageParams: {}, onConfirm: null };

  // Advanced analytics
  topLocations: DonutItem[] = [];
  topCountries: DonutItem[] = [];
  deviceBreakdown: DonutItem[] = [];
  browserBreakdown: DonutItem[] = [];
  osBreakdown: DonutItem[] = [];
  trafficSources: DonutItem[] = [];

  // Pre-aggregated monthly + total stats
  monthlyViews = 0;
  statsLocations: DonutItem[] = [];
  statsMonthlyLocations: DonutItem[] = [];
  statsDevices: DonutItem[] = [];
  statsMonthlyDevices: DonutItem[] = [];
  lastResetAt: string | null = null;
  resettingStats = false;

  // Additional dashboard sections
  topPages: TopPage[] = [];
  monthlyHistory: MonthlyHistoryEntry[] = [];
  auditLogs: AuditLogEntry[] = [];
  chatbotStats: ChatbotStats = { totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0 };
  systemHealth: SystemHealth | null = null;
  totalContacts = 0;

  // Chat session viewer
  todaySessions: ChatbotSession[] = [];
  todaySessionsTotal = 0;
  todaySessionsTotalPages = 1;
  todaySessionsPage = 1;
  expandedSessionId: string | null = null;
  loadingTodaySessions = false;

  lastLoadedAt: Date | null = null;
  private dataSubscription: Subscription | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Reply form
  showReplyForm = false;
  replyText = '';
  sendingReply = false;
  replyResult: 'success' | 'error' | null = null;

  readonly trafficColors = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444'];
  readonly deviceColors  = ['#06b6d4', '#ec4899', '#10b981'];
  readonly browserColors = ['#f59e0b', '#6366f1', '#ef4444', '#14b8a6', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];
  readonly countryColors = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6', '#0ea5e9', '#a78bfa'];

  readonly quickLinks = [
    { labelKey: 'admin.manage_projects',    icon: 'work',       route: '/dashboard/projects' },
    { labelKey: 'admin.manage_experiences', icon: 'history_edu',route: '/dashboard/experiences' },
    { labelKey: 'admin.manage_blog',        icon: 'article',    route: '/dashboard/blog' },
    { labelKey: 'admin.edit_about',         icon: 'person',     route: '/dashboard/about' },
  ];

  constructor(
    public auth: AuthService,
    private projectsService: ProjectsService,
    private experiencesService: ExperiencesService,
    private blogService: BlogService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadData();
    this.refreshInterval = setInterval(() => this.loadData(), 60_000);
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  loadData(): void {
    this.loading = true;
    this.dataSubscription?.unsubscribe();

    const emptyStats: AdminStatsResponse = {
      users: 0,
      contacts: 0,
      unreadContacts: 0,
      recentContacts: [],
      contactsByDay: [],
      content: { total: 0, published: 0, drafts: 0 },
      visits: { totalViews: 0, uniqueVisitors: 0, viewsByDay: [] },
    };

    const emptyAdvanced: AdvancedAnalytics = {
      todayCount: 0,
      topLocations: [],
      topCountries: [],
      deviceBreakdown: [],
      browserBreakdown: [],
      osBreakdown: [],
      trafficSources: [],
    };

    const emptyAnalyticsStats: AnalyticsStats = {
      totalViews: 0,
      monthlyViews: 0,
      locations: [],
      monthlyLocations: [],
      devices: [],
      monthlyDevices: [],
      lastResetAt: null,
    };

    this.dataSubscription = combineLatest({
      projects: this.projectsService.getAll().pipe(catchError(() => of([])), startWith([])),
      experiences: this.experiencesService.getAll().pipe(catchError(() => of([])), startWith([])),
      adminStats: this.http.get<AdminStatsResponse>(`${environment.apiUrl}/stats`).pipe(
        catchError(() => of(emptyStats)),
        startWith(emptyStats),
      ),
      advanced: this.http.get<AdvancedAnalytics>(`${environment.apiUrl}/analytics/advanced`).pipe(
        catchError(() => of(emptyAdvanced)),
        startWith(emptyAdvanced),
      ),
      analyticsStats: this.http.get<AnalyticsStats>(`${environment.apiUrl}/analytics`).pipe(
        catchError(() => of(emptyAnalyticsStats)),
        startWith(emptyAnalyticsStats),
      ),
      topPages: this.http.get<TopPage[]>(`${environment.apiUrl}/analytics/top-pages`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      monthlyHistory: this.http.get<MonthlyHistoryEntry[]>(`${environment.apiUrl}/analytics/monthly-history`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      auditLogs: this.http.get<AuditLogEntry[]>(`${environment.apiUrl}/audit?limit=10`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      chatbotStats: this.http.get<ChatbotStats>(`${environment.apiUrl}/chatbot/stats`).pipe(
        catchError(() => of({ totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0 })),
        startWith({ totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0 }),
      ),
      systemHealth: this.http.get<SystemHealth>(`${environment.apiUrl}/system/health`).pipe(
        catchError(() => of(null as SystemHealth | null)),
        startWith(null as SystemHealth | null),
      ),
      blogPosts: this.blogService.getAll().pipe(catchError(() => of([])), startWith([])),
    }).subscribe({
      next: ({ projects, experiences, adminStats, advanced, analyticsStats, blogPosts,
               topPages, monthlyHistory, auditLogs, chatbotStats, systemHealth }) => {
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
          { labelKey: 'admin.projects',    value: projects.length,                  icon: 'work',                   route: '/dashboard/projects',    color: '#6366f1', miniBars: this.buildMiniBars(projects.length, maxValue, 0) },
          { labelKey: 'admin.experiences', value: experiences.length,               icon: 'history_edu',            route: '/dashboard/experiences', color: '#06b6d4', miniBars: this.buildMiniBars(experiences.length, maxValue, 1) },
          { labelKey: 'admin.blog_posts',  value: totalPosts,                       icon: 'article',                route: '/dashboard/blog',        color: '#10b981', miniBars: this.buildMiniBars(totalPosts, maxValue, 2) },
          { labelKey: 'admin.published',   value: publishedPosts,                   icon: 'published_with_changes', route: '/dashboard/blog',        color: '#f59e0b', miniBars: this.buildMiniBars(publishedPosts, maxValue, 3) },
          { labelKey: 'admin.contacts',    value: adminStats.contacts,              icon: 'mail',                   route: '/dashboard',             color: '#ec4899', miniBars: this.buildMiniBars(adminStats.contacts, maxValue, 4) },
          { labelKey: 'admin.users',       value: adminStats.users,                 icon: 'group',                  route: '/dashboard',             color: '#8b5cf6', miniBars: this.buildMiniBars(adminStats.users, maxValue, 5) },
          { labelKey: 'admin.visits',      value: adminStats.visits.totalViews,     icon: 'visibility',             route: '/dashboard',             color: '#14b8a6', miniBars: this.buildMiniBars(adminStats.visits.totalViews, maxValue, 6) },
          { labelKey: 'admin.visitors',    value: adminStats.visits.uniqueVisitors, icon: 'monitoring',             route: '/dashboard',             color: '#ef4444', miniBars: this.buildMiniBars(adminStats.visits.uniqueVisitors, maxValue, 7) },
        ];
        this.recentContacts = adminStats.recentContacts;
        this.unreadCount = adminStats.unreadContacts ?? 0;
        this.contactBars = adminStats.contactsByDay.map(item => ({ date: item.date, value: item.count }));
        this.visitBars = adminStats.visits.viewsByDay.map(item => ({ date: item.date, value: item.count }));
        this.publishedPosts = publishedPosts;
        this.draftPosts = adminStats.content.drafts;
        this.totalViews = adminStats.visits.totalViews;
        this.uniqueVisitors = adminStats.visits.uniqueVisitors;

        // Top posts by view count
        this.topPosts = [...blogPosts]
          .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
          .slice(0, 5);

        // Advanced analytics
        this.todayVisitors = advanced.todayCount;
        this.topLocations = advanced.topLocations;
        this.topCountries = advanced.topCountries;
        this.deviceBreakdown = advanced.deviceBreakdown;
        this.browserBreakdown = advanced.browserBreakdown;
        this.osBreakdown = advanced.osBreakdown;
        this.trafficSources = advanced.trafficSources;

        // Pre-aggregated monthly + total stats
        this.monthlyViews = analyticsStats.monthlyViews;
        this.statsLocations = analyticsStats.locations;
        this.statsMonthlyLocations = analyticsStats.monthlyLocations;
        this.statsDevices = analyticsStats.devices;
        this.statsMonthlyDevices = analyticsStats.monthlyDevices;
        this.lastResetAt = analyticsStats.lastResetAt;

        this.topPages = topPages;
        this.monthlyHistory = monthlyHistory;
        this.auditLogs = Array.isArray(auditLogs) ? auditLogs : [];
        this.chatbotStats = chatbotStats;
        this.systemHealth = systemHealth;
        this.totalContacts = adminStats.contacts;

        this.lastLoadedAt = new Date();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  get allSelected(): boolean {
    return this.recentContacts.length > 0 &&
      this.recentContacts.every(c => c._id && this.selectedIds.has(c._id));
  }

  get anySelected(): boolean {
    return this.selectedIds.size > 0;
  }

  get maxContactBarValue(): number {
    return Math.max(...this.contactBars.map(bar => bar.value), 1);
  }

  get maxVisitBarValue(): number {
    return Math.max(...this.visitBars.map(bar => bar.value), 1);
  }

  get maxStatsLocationCount(): number {
    return Math.max(...this.statsLocations.map(l => l.count), 1);
  }

  get maxStatsMonthlyLocationCount(): number {
    return Math.max(...this.statsMonthlyLocations.map(l => l.count), 1);
  }

  statsLocationBarWidth(count: number): number {
    return Math.max((count / this.maxStatsLocationCount) * 100, count > 0 ? 6 : 0);
  }

  statsMonthlyLocationBarWidth(count: number): number {
    return Math.max((count / this.maxStatsMonthlyLocationCount) * 100, count > 0 ? 6 : 0);
  }

  get conversionRate(): number {
    return this.totalViews ? (this.totalContacts / this.totalViews) * 100 : 0;
  }

  private get currentMonthKey(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }

  get trendData(): MonthlyHistoryEntry[] {
    return [
      ...this.monthlyHistory,
      { month: this.currentMonthKey, views: this.monthlyViews },
    ];
  }

  get monthlyGrowth(): number | null {
    if (this.monthlyHistory.length < 1) return null;
    const prev = this.monthlyHistory[this.monthlyHistory.length - 1].views;
    if (!prev) return null;
    return ((this.monthlyViews - prev) / prev) * 100;
  }

  get maxTrendViews(): number {
    return Math.max(...this.trendData.map(h => h.views), 1);
  }

  trendBarWidth(views: number): number {
    return Math.max((views / this.maxTrendViews) * 100, views > 0 ? 4 : 0);
  }

  get maxTopPageCount(): number {
    return Math.max(...this.topPages.map(p => p.count), 1);
  }

  topPageBarWidth(count: number): number {
    return Math.max((count / this.maxTopPageCount) * 100, count > 0 ? 4 : 0);
  }

  methodBadgeColor(method: string): string {
    const map: Record<string, string> = {
      POST: '#10b981', PUT: '#f59e0b', PATCH: '#6366f1', DELETE: '#ef4444',
    };
    return map[method?.toUpperCase()] ?? '#8b5cf6';
  }

  loadTodaySessions(page = 1): void {
    if (this.loadingTodaySessions) return;
    this.loadingTodaySessions = true;
    this.http.get<ChatbotSessionsPage>(`${environment.apiUrl}/chatbot/sessions/today?page=${page}&limit=10`).subscribe({
      next: ({ data, total, page: p, totalPages }) => {
        this.todaySessions = data;
        this.todaySessionsTotal = total;
        this.todaySessionsPage = p;
        this.todaySessionsTotalPages = totalPages;
        this.loadingTodaySessions = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingTodaySessions = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleSession(sessionId: string): void {
    this.expandedSessionId = this.expandedSessionId === sessionId ? null : sessionId;
  }

  sessionPreview(session: ChatbotSession): string {
    const first = session.messages.find(m => m.role === 'user');
    if (!first) return '—';
    return first.content.length > 60 ? first.content.slice(0, 60) + '…' : first.content;
  }

  get maxCountryCount(): number {
    return Math.max(...this.topCountries.map(c => c.count), 1);
  }

  get maxLocationCount(): number {
    return Math.max(...this.topLocations.map(location => location.count), 1);
  }

  get maxBrowserCount(): number {
    return Math.max(...this.browserBreakdown.map(b => b.count), 1);
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

  countryBarWidth(count: number): number {
    return Math.max((count / this.maxCountryCount) * 100, count > 0 ? 6 : 0);
  }

  locationBarWidth(count: number): number {
    return Math.max((count / this.maxLocationCount) * 100, count > 0 ? 6 : 0);
  }

  browserBarWidth(count: number): number {
    return Math.max((count / this.maxBrowserCount) * 100, count > 0 ? 6 : 0);
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

    // Optimistic update: mark as read locally immediately so the "NEW" badge disappears
    const prevRead = contact.read;
    this.recentContacts = this.recentContacts.map(item => item._id === contact._id ? { ...item, read: true } : item);
    this.selectedContact = { ...contact, read: true };
    this.unreadCount = Math.max(0, this.unreadCount - 1);

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
        this.unreadCount += 1;
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

    const wasRead = this.selectedContact.read;
    this.markingRead = true;
    this.http.patch<RecentContact>(`${environment.apiUrl}/contact/${this.selectedContact._id}/read`, { read }).subscribe({
      next: (updatedContact) => {
        this.recentContacts = this.recentContacts.map(item => item._id === updatedContact._id ? updatedContact : item);
        this.selectedContact = updatedContact;
        this.markingRead = false;
        // Keep unread counter in sync with toggles done from the modal
        if (read && !wasRead) {
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        } else if (!read && wasRead) {
          this.unreadCount += 1;
        }
        this.showActionMessage(read ? 'admin.marked_read' : 'admin.marked_unread');
      },
      error: () => {
        this.markingRead = false;
      },
    });
  }

  deleteSelectedContact(): void {
    if (!this.selectedContact?._id || this.deletingContact) return;

    const contactId = this.selectedContact._id;
    this.openConfirmDialog('admin.confirm_delete_message', {}, () => {
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
          this.refreshContacts();
        },
        error: () => {
          this.deletingContact = false;
        },
      });
    });
  }

  replyToSelectedContact(): void {
    this.showReplyForm = !this.showReplyForm;
    this.replyText = '';
    this.replyResult = null;
  }

  cancelReply(): void {
    this.showReplyForm = false;
    this.replyText = '';
    this.replyResult = null;
  }

  sendReply(): void {
    if (!this.selectedContact?._id || !this.replyText.trim() || this.sendingReply) return;
    this.sendingReply = true;
    this.replyResult = null;
    this.http.post<{ repliedAt: string }>(
      `${environment.apiUrl}/contact/${this.selectedContact._id}/reply`,
      { replyText: this.replyText.trim() },
    ).subscribe({
      next: () => {
        this.replyResult = 'success';
        this.sendingReply = false;
        // Update contact as replied
        this.selectedContact = { ...this.selectedContact!, read: true };
        this.recentContacts = this.recentContacts.map(c =>
          c._id === this.selectedContact!._id ? { ...c, read: true } : c,
        );
        this.replyText = '';
        setTimeout(() => {
          this.showReplyForm = false;
          this.replyResult = null;
          this.cdr.markForCheck();
        }, 2500);
        this.cdr.markForCheck();
      },
      error: () => {
        this.replyResult = 'error';
        this.sendingReply = false;
        this.cdr.markForCheck();
      },
    });
  }

  toggleSelectContact(id: string): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    // Replace reference to trigger change detection
    this.selectedIds = new Set(this.selectedIds);
  }

  toggleSelectAll(): void {
    if (this.allSelected) {
      this.selectedIds = new Set<string>();
    } else {
      this.selectedIds = new Set(
        this.recentContacts.filter(c => c._id).map(c => c._id as string),
      );
    }
  }

  deleteSelected(): void {
    if (!this.anySelected || this.bulkDeleting) return;

    const ids = [...this.selectedIds];
    this.openConfirmDialog(
      'admin.confirm_delete_bulk',
      { count: ids.length },
      () => {
        this.bulkDeleting = true;
        this.http.post<{ success: boolean; deleted: number }>(
          `${environment.apiUrl}/contact/bulk-delete`,
          { ids },
        ).subscribe({
          next: ({ deleted }) => {
            this.recentContacts = this.recentContacts.filter(
              c => !c._id || !ids.includes(c._id),
            );
            this.selectedIds = new Set<string>();
            this.bulkDeleting = false;
            this.stats = this.stats.map(stat =>
              stat.labelKey === 'admin.contacts'
                ? { ...stat, value: Math.max(stat.value - deleted, 0) }
                : stat,
            );
            this.showActionMessage('admin.messages_deleted');
            this.refreshContacts();
          },
          error: () => {
            this.bulkDeleting = false;
          },
        });
      },
    );
  }

  openConfirmDialog(messageKey: string, messageParams: Record<string, unknown>, onConfirm: () => void): void {
    this.confirmDialog = { visible: true, messageKey, messageParams, onConfirm };
  }

  confirmDialogAction(): void {
    const fn = this.confirmDialog.onConfirm;
    this.confirmDialog = { visible: false, messageKey: '', messageParams: {}, onConfirm: null };
    fn?.();
  }

  cancelConfirmDialog(): void {
    this.confirmDialog = { visible: false, messageKey: '', messageParams: {}, onConfirm: null };
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

  resetMonthlyStats(): void {
    if (this.resettingStats) return;
    this.openConfirmDialog('admin.confirm_reset_monthly_stats', {}, () => {
      this.resettingStats = true;
      this.http.post<{ success: boolean; message: string }>(`${environment.apiUrl}/analytics/reset`, {}).subscribe({
        next: () => {
          this.resettingStats = false;
          this.monthlyViews = 0;
          this.statsMonthlyLocations = [];
          this.statsMonthlyDevices = [];
          this.lastResetAt = new Date().toISOString();
          this.showActionMessage('admin.monthly_stats_reset');
          this.cdr.markForCheck();
        },
        error: () => {
          this.resettingStats = false;
          this.cdr.markForCheck();
        },
      });
    });
  }

  private refreshContacts(): void {
    this.http.get<AdminStatsResponse>(`${environment.apiUrl}/stats`).pipe(
      catchError(() => of(null)),
    ).subscribe(adminStats => {
      if (!adminStats) return;
      this.recentContacts = adminStats.recentContacts;
      this.unreadCount = adminStats.unreadContacts ?? 0;
      this.stats = this.stats.map(stat =>
        stat.labelKey === 'admin.contacts'
          ? { ...stat, value: adminStats.contacts }
          : stat,
      );
    });
  }

  downloadCsv(): void {
    this.http.get(`${environment.apiUrl}/analytics/export/csv`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
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
