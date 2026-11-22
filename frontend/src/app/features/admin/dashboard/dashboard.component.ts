import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, HostListener, ViewChild, inject, viewChild } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DonutItem } from '../../../shared/components/donut-chart/donut-chart.component';
import {
  AdminDashboardService,
  DashboardOverview,
  DashboardOverviewData,
  LIVE_SECTIONS,
  OverviewSection,
  PartialOverview,
  TopPost,
  TopPage,
  MonthlyHistoryEntry,
  AuditLogEntry,
  SearchConsoleSummary,
  ChatbotStats,
  SystemHealth,
  SystemDetails,
  OperationsInfo,
  RecentContact,
  LiveHandoffSession,
  ToolConversionRow,
  AiUsageOverview,
  ServerErrorSummary,
  ServerHealth,
  TranslationHealth,
  ScheduledPost,
  LeadStats,
  NotFoundSummary,
  SecuritySummary,
} from './admin-dashboard.service';
import { DASHBOARD_POLL_MS, failedSectionLabels, needsFullRefresh, shouldRefreshOnVisible, sparkline } from './dashboard-metrics';
import { DashboardCardComponent } from './components/dashboard-card/dashboard-card.component';
import { LeadsPanelComponent } from './panels/leads-panel.component';
import { OpsSectionComponent } from './sections/ops-section/ops-section.component';
import { ContentSectionComponent } from './sections/content-section/content-section.component';
import { ActivitySectionComponent, ConsentRates, DayBar } from './sections/activity-section/activity-section.component';
import { VisitorStats, VisitorsSectionComponent } from './sections/visitors-section/visitors-section.component';
import { AcquisitionSectionComponent } from './sections/acquisition-section/acquisition-section.component';
import { SeoSectionComponent } from './sections/seo-section/seo-section.component';
import { UtilitySectionComponent } from './sections/utility-section/utility-section.component';
import { ChatSessionsSectionComponent } from './sections/chat-sessions-section/chat-sessions-section.component';
import {
  activeLiveHandoffs,
  waitingLiveHandoffs,
  liveHandoffStatusKey,
  liveHandoffRoute,
} from './live-handoff-card.util';

interface StatCard {
  labelKey: string;
  /** null = sezione fallita: il template mostra "—" invece di uno zero finto. */
  value: number | null;
  icon: string;
  route: string;
  color: string;
  /** Sparkline da una serie reale per giorno, null se la metrica non ne ha una. */
  spark: number[] | null;
  /** Filtro della pagina di destinazione (es. solo bozze). */
  query?: Record<string, string>;
}

/** Voce dell'indice in cima alla dashboard: porta alla sezione con quell'id. */
export interface DashboardNavItem {
  id: string;
  labelKey: string;
}

/**
 * Dashboard admin. Questo componente carica i dati (GET /stats/overview) e
 * gestisce i messaggi; le sezioni (sections/*) li mostrano e quelle sotto la
 * piega si caricano solo quando ci si arriva (@defer on viewport).
 *
 * Polling: ogni DASHBOARD_POLL_MS solo le sezioni vive (LIVE_SECTIONS: chat
 * live, contatori, errori…), ogni DASHBOARD_FULL_REFRESH_MS tutto. Il pulsante
 * "Aggiorna" ricarica sempre tutto saltando la cache del server.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, MatButtonModule, MatIconModule, TranslateModule, ConfirmDialogComponent,
    DashboardCardComponent, LeadsPanelComponent,
    OpsSectionComponent, ContentSectionComponent, ActivitySectionComponent, VisitorsSectionComponent,
    AcquisitionSectionComponent, SeoSectionComponent, UtilitySectionComponent, ChatSessionsSectionComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  stats: StatCard[] = [];
  /** Chat live aperte o in attesa — permette di rientrare in una sessione lasciata a metà. */
  liveHandoffs: LiveHandoffSession[] = [];
  recentContacts: RecentContact[] = [];
  contactBars: DayBar[] = [];
  visitBars: DayBar[] = [];
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

  topPosts: TopPost[] = [];

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

  // Statistiche visitatori (dalle visite registrate)
  topLocations: DonutItem[] = [];
  topCountries: DonutItem[] = [];
  browserBreakdown: DonutItem[] = [];
  osBreakdown: DonutItem[] = [];
  trafficSources: DonutItem[] = [];

  // Contatori pre-aggregati del mese e complessivi
  monthlyViews = 0;
  consent: ConsentRates = { total: 0, analyticsRate: 0, marketingRate: 0, preferencesRate: 0 };
  statsLocations: DonutItem[] = [];
  statsMonthlyLocations: DonutItem[] = [];
  statsDevices: DonutItem[] = [];
  statsMonthlyDevices: DonutItem[] = [];
  lastResetAt: string | null = null;
  resettingStats = false;

  topPages: TopPage[] = [];
  toolConversion: ToolConversionRow[] = [];
  monthlyHistory: MonthlyHistoryEntry[] = [];
  auditLogs: AuditLogEntry[] = [];
  chatbotStats: ChatbotStats = { totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0, fallbackRepliesToday: 0 };
  systemHealth: SystemHealth | null = null;
  systemDetails: SystemDetails | null = null;
  systemOps: OperationsInfo | null = null;
  aiUsage!: AiUsageOverview;
  serverErrors!: ServerErrorSummary;
  serverHealth: ServerHealth | null = null;
  translationHealth!: TranslationHealth;
  scheduledPosts: ScheduledPost[] = [];
  leads!: LeadStats;
  notFound: NotFoundSummary = { open: 0, top: [] };
  security: SecuritySummary = { failedLogins24h: 0, otpFailed24h: 0, tokenReuse: 0, activeSessions: 0, suspiciousIps: [], sessions: [], events: [] };

  gscSummary: SearchConsoleSummary = {
    configured: false, clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0, topQueries: [], topPages: [],
  };

  /** Tutto ciò che mostra la sezione Visitatori, ricostruito a ogni aggiornamento. */
  visitorStats!: VisitorStats;

  lastLoadedAt: Date | null = null;
  /** Ultimo caricamento completo (tutte le sezioni): il polling leggero lo rinnova ogni DASHBOARD_FULL_REFRESH_MS. */
  private lastFullAt: Date | null = null;
  /** Dati dell'ultimo snapshot, su cui si fondono gli aggiornamenti parziali. */
  private lastData: DashboardOverviewData | null = null;
  /** Sezioni che il server non è riuscito a caricare nell'ultimo snapshot. */
  failedSections: ReadonlySet<OverviewSection> = new Set();
  /** L'intera richiesta è fallita (rete, 401, 5xx): si tengono i dati precedenti e lo si dice. */
  loadFailed = false;
  /** Refresh successivi al primo: niente schermata di caricamento, solo l'icona che gira. */
  refreshing = false;
  private readonly document = inject(DOCUMENT);
  private readonly onVisibilityChange = () => {
    if (shouldRefreshOnVisible(this.document.hidden, this.lastLoadedAt)) this.poll();
  };
  private dataSubscription: Subscription | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  private readonly acquisitionSection = viewChild(AcquisitionSectionComponent);
  private readonly chatSessions = viewChild(ChatSessionsSectionComponent);

  // Reply form
  showReplyForm = false;
  replyText = '';
  sendingReply = false;
  replyResult: 'success' | 'error' | null = null;

  readonly quickLinks = [
    { labelKey: 'admin.manage_projects',    icon: 'work',       route: '/dashboard/projects' },
    { labelKey: 'admin.manage_experiences', icon: 'history_edu',route: '/dashboard/experiences' },
    { labelKey: 'admin.manage_blog',        icon: 'article',    route: '/dashboard/blog' },
    { labelKey: 'admin.manage_notes',       icon: 'forum',      route: '/dashboard/notes' },
    { labelKey: 'admin.edit_about',         icon: 'person',     route: '/dashboard/about' },
  ];

  constructor(
    public auth: AuthService,
    private adminDashboard: AdminDashboardService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadData();
    // In una scheda nascosta non si interroga il server: al ritorno si
    // aggiorna subito se lo snapshot è più vecchio del polling.
    this.refreshInterval = setInterval(() => {
      if (!this.document.hidden) this.poll();
    }, DASHBOARD_POLL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /** Indice delle sezioni: la SEO compare solo se Search Console è configurato, i messaggi solo se ce ne sono. */
  get navItems(): DashboardNavItem[] {
    return [
      { id: 'dash-overview', labelKey: 'dashboard_ux.nav_overview' },
      { id: 'dash-ops', labelKey: 'dashboard_ux.nav_ops' },
      { id: 'dash-content', labelKey: 'dashboard_ux.nav_content' },
      { id: 'dash-activity', labelKey: 'dashboard_ux.nav_activity' },
      { id: 'dash-visitors', labelKey: 'dashboard_ux.nav_visitors' },
      { id: 'dash-acquisition', labelKey: 'dashboard_ux.nav_acquisition' },
      ...(this.gscSummary.configured ? [{ id: 'dash-seo', labelKey: 'dashboard_ux.nav_seo' }] : []),
      { id: 'dash-utility', labelKey: 'dashboard_ux.nav_utility' },
      { id: 'dash-chat', labelKey: 'dashboard_ux.nav_chat' },
      ...(this.recentContacts.length ? [{ id: 'dash-messages', labelKey: 'dashboard_ux.nav_messages' }] : []),
    ];
  }

  scrollTo(id: string): void {
    this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Pulsante "Aggiorna": salta la cache di 30s del server. */
  refresh(): void {
    this.loadData(true);
  }

  isFailed(section: OverviewSection): boolean {
    return this.failedSections.has(section);
  }

  get failedLabelKeys(): string[] {
    return failedSectionLabels(this.failedSections);
  }

  /** Giro di polling: tutto ogni DASHBOARD_FULL_REFRESH_MS, altrimenti solo le sezioni vive. */
  poll(): void {
    if (needsFullRefresh(this.lastFullAt) || !this.lastData) {
      this.loadData();
    } else {
      this.loadLive();
    }
  }

  loadData(fresh = false): void {
    this.refreshing = !this.loading;
    this.dataSubscription?.unsubscribe();
    this.dataSubscription = this.adminDashboard.loadOverview(fresh).subscribe({
      next: (overview) => {
        this.lastFullAt = new Date();
        // I pannelli Provenienza e Contatti caricano da soli: al giro completo si aggiornano anche loro.
        if (this.lastData) this.acquisitionSection()?.reload();
        this.applyOverview(overview);
      },
      error: () => this.onLoadError(),
    });
  }

  /** Solo le sezioni vive, fuse con lo snapshot in pagina. */
  private loadLive(): void {
    this.dataSubscription?.unsubscribe();
    this.dataSubscription = this.adminDashboard.loadSections(LIVE_SECTIONS).subscribe({
      next: (partial) => this.applyPartial(partial),
      error: () => this.onLoadError(),
    });
  }

  private onLoadError(): void {
    this.loadFailed = true;
    this.loading = false;
    this.refreshing = false;
    this.cdr.markForCheck();
  }

  private applyPartial(partial: PartialOverview): void {
    if (!this.lastData) return;
    const failed = new Set([...this.failedSections].filter(k => !partial.requested.has(k)));
    partial.failed.forEach(k => failed.add(k));
    this.applyOverview({
      data: { ...this.lastData, ...partial.data },
      failed,
      generatedAt: new Date().toISOString(),
    });
  }

  private applyOverview({ data, failed }: DashboardOverview): void {
    const { core: adminStats, advanced, analyticsStats, consentStats } = data;
    const coreFailed = failed.has('core');
    const coreValue = (v: number) => (coreFailed ? null : v);

    this.lastData = data;
    this.failedSections = failed;
    this.loadFailed = false;
    this.liveHandoffs = data.liveHandoffs;
    this.toolConversion = data.toolConversion;
    this.stats = [
      { labelKey: 'admin.projects',    value: failed.has('projectsCount') ? null : data.projectsCount,       icon: 'work',                   route: '/dashboard/projects',    color: '#6366f1', spark: null },
      { labelKey: 'admin.experiences', value: failed.has('experiencesCount') ? null : data.experiencesCount, icon: 'history_edu',            route: '/dashboard/experiences', color: '#06b6d4', spark: null },
      { labelKey: 'admin.blog_posts',  value: coreValue(adminStats.content.total),                           icon: 'article',                route: '/dashboard/blog',        color: '#10b981', spark: null },
      { labelKey: 'admin.published',   value: coreValue(adminStats.content.published),                       icon: 'published_with_changes', route: '/dashboard/blog',        color: '#f59e0b', spark: null, query: { status: 'published' } },
      // Bozze: un clic apre la lista articoli filtrata sulle sole bozze.
      { labelKey: 'admin.drafts',      value: coreValue(adminStats.content.drafts),                          icon: 'edit',                   route: '/dashboard/blog',        color: '#64748b', spark: null, query: { status: 'draft' } },
      { labelKey: 'admin.contacts',    value: coreValue(adminStats.contacts),                                icon: 'mail',                   route: '/dashboard/contacts',             color: '#ec4899', spark: sparkline(adminStats.contactsByDay) },
      { labelKey: 'admin.users',       value: coreValue(adminStats.users),                                   icon: 'group',                  route: '/dashboard/users',             color: '#8b5cf6', spark: null },
      { labelKey: 'admin.visits',      value: coreValue(adminStats.visits.totalViews),                       icon: 'visibility',             route: '/dashboard',             color: '#14b8a6', spark: sparkline(adminStats.visits.viewsByDay) },
      { labelKey: 'admin.visitors',    value: coreValue(adminStats.visits.uniqueVisitors),                   icon: 'monitoring',             route: '/dashboard',             color: '#ef4444', spark: null },
    ];
    this.recentContacts = adminStats.recentContacts;
    this.unreadCount = adminStats.unreadContacts ?? 0;
    this.contactBars = adminStats.contactsByDay.map(item => ({ date: item.date, value: item.count }));
    this.visitBars = adminStats.visits.viewsByDay.map(item => ({ date: item.date, value: item.count }));
    this.publishedPosts = adminStats.content.published;
    this.draftPosts = adminStats.content.drafts;
    this.totalViews = adminStats.visits.totalViews;
    this.uniqueVisitors = adminStats.visits.uniqueVisitors;

    // Già ordinati e limitati lato server (prima si scaricavano tutti i post).
    this.topPosts = data.topPosts;

    // Advanced analytics
    this.todayVisitors = advanced.todayCount;
    this.topLocations = advanced.topLocations;
    this.topCountries = advanced.topCountries;
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

    this.topPages = data.topPages;
    this.monthlyHistory = data.monthlyHistory;
    this.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
    this.chatbotStats = data.chatbotStats;
    this.systemHealth = data.systemHealth;
    this.systemDetails = data.systemDetails;
    this.systemOps = data.systemOps;
    this.aiUsage = data.aiUsage;
    this.serverErrors = data.serverErrors;
    this.serverHealth = data.serverHealth;
    this.translationHealth = data.translationHealth;
    this.scheduledPosts = data.scheduledPosts;
    this.leads = data.leads;
    this.notFound = data.notFound;
    this.security = data.security;
    this.gscSummary = data.gsc;

    this.consent = {
      total: consentStats.total,
      analyticsRate: consentStats.analyticsRate,
      marketingRate: consentStats.marketingRate,
      preferencesRate: consentStats.preferencesRate,
    };
    this.visitorStats = this.buildVisitorStats();

    this.lastLoadedAt = new Date();
    this.loading = false;
    this.refreshing = false;
    this.cdr.markForCheck();
  }

  /** Mesi passati + mese corrente, per l'andamento mensile. */
  private get trendData(): MonthlyHistoryEntry[] {
    const n = new Date();
    const current = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    return [...this.monthlyHistory, { month: current, views: this.monthlyViews }];
  }

  private buildVisitorStats(): VisitorStats {
    return {
      totalViews: this.totalViews,
      monthlyViews: this.monthlyViews,
      lastResetAt: this.lastResetAt,
      todayVisitors: this.todayVisitors,
      uniqueVisitors: this.uniqueVisitors,
      statsLocations: this.statsLocations,
      statsMonthlyLocations: this.statsMonthlyLocations,
      statsDevices: this.statsDevices,
      statsMonthlyDevices: this.statsMonthlyDevices,
      osBreakdown: this.osBreakdown,
      trafficSources: this.trafficSources,
      topLocations: this.topLocations,
      topCountries: this.topCountries,
      browserBreakdown: this.browserBreakdown,
      trend: this.trendData,
      chatbotStats: this.chatbotStats,
      topPages: this.topPages,
      toolConversion: this.toolConversion,
    };
  }

  get allSelected(): boolean {
    return this.recentContacts.length > 0 &&
      this.recentContacts.every(c => c._id && this.selectedIds.has(c._id));
  }

  get anySelected(): boolean {
    return this.selectedIds.size > 0;
  }

  /** Dal pannello Utility: carica le chat di oggi e porta alla sezione. */
  loadTodaySessions(): void {
    this.chatSessions()?.load();
    this.scrollTo('dash-chat');
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

  @ViewChild('contactModalCloseBtn') private contactModalCloseBtnRef?: ElementRef<HTMLButtonElement>;

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.selectedContact) this.closeContact();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro la modale finché è aperta. */
  onContactModalTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const modal = ke.currentTarget as HTMLElement;
    const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }

  openContact(contact: RecentContact): void {
    this.selectedContact = contact;
    setTimeout(() => this.contactModalCloseBtnRef?.nativeElement.focus(), 0);

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
    this.adminDashboard.markContactRead(contact._id).subscribe({
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
    this.adminDashboard.markContactRead(this.selectedContact._id, read).subscribe({
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
      this.adminDashboard.deleteContact(contactId).subscribe({
        next: () => {
          this.recentContacts = this.recentContacts.filter(item => item._id !== contactId);
          this.stats = this.stats.map(stat => stat.labelKey === 'admin.contacts'
            ? { ...stat, value: stat.value === null ? null : Math.max(stat.value - 1, 0) }
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
    this.adminDashboard.replyToContact(this.selectedContact._id, this.replyText.trim()).subscribe({
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
        this.adminDashboard.bulkDeleteContacts(ids).subscribe({
          next: ({ deleted }) => {
            this.recentContacts = this.recentContacts.filter(
              c => !c._id || !ids.includes(c._id),
            );
            this.selectedIds = new Set<string>();
            this.bulkDeleting = false;
            this.stats = this.stats.map(stat =>
              stat.labelKey === 'admin.contacts'
                ? { ...stat, value: stat.value === null ? null : Math.max(stat.value - deleted, 0) }
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

  // ── Chat live (logica in live-handoff-card.util.ts, testata a parte) ─────
  get liveHandoffActive(): LiveHandoffSession[] {
    return activeLiveHandoffs(this.liveHandoffs);
  }

  get liveHandoffWaiting(): LiveHandoffSession[] {
    return waitingLiveHandoffs(this.liveHandoffs);
  }

  liveHandoffStatusKey(session: LiveHandoffSession): string {
    return liveHandoffStatusKey(session);
  }

  liveHandoffRoute(session: LiveHandoffSession): (string | number)[] {
    return liveHandoffRoute(session);
  }


  resetMonthlyStats(): void {
    if (this.resettingStats) return;
    this.openConfirmDialog('admin.confirm_reset_monthly_stats', {}, () => {
      this.resettingStats = true;
      this.adminDashboard.resetMonthlyStats().subscribe({
        next: () => {
          this.resettingStats = false;
          this.monthlyViews = 0;
          this.statsMonthlyLocations = [];
          this.statsMonthlyDevices = [];
          this.lastResetAt = new Date().toISOString();
          this.visitorStats = this.buildVisitorStats();
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
    this.adminDashboard.getStats().subscribe(adminStats => {
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
    this.adminDashboard.exportAnalyticsCsv().subscribe({
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
