import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, HostListener, ViewChild, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';
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
import { failedSectionLabels, sparkline } from './dashboard-metrics';
import { COLLAPSIBLE_SECTIONS, loadOpenSections, saveOpenSections } from './dashboard-sections';
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

/** Voce di "Da fare adesso": un conteggio che richiede attenzione e dove andare a gestirlo. */
export interface AttentionItem {
  id: string;
  icon: string;
  count: number;
  labelKey: string;
  tone: 'bad' | 'warn' | 'info';
  /** Pagina da aprire, oppure id della sezione a cui scorrere. */
  route?: (string | number)[];
  section?: string;
}

/** Riepilogo di una riga nell'intestazione di una sezione chiusa. */
export interface SectionBadge {
  icon: string;
  value: number | string;
  labelKey: string;
  tone: 'bad' | 'warn' | 'ok' | 'info';
}

/** Le quattro metriche grandi in alto; le altre (contenuti) sono una riga compatta. */
const PRIMARY_STATS = ['admin.visits', 'admin.visitors', 'admin.contacts', 'admin.users'] as const;

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
 * Nessun aggiornamento a intervalli: i dati si ricaricano con "Aggiorna"
 * (saltando la cache del server). Fa eccezione quello che arriva in tempo reale
 * dal WebSocket admin (nuovo contatto, richiesta di chat live…): allora si
 * ricaricano solo le sezioni interessate (LIVE_SECTIONS).
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, MatButtonModule, MatExpansionModule, MatIconModule, TranslateModule, ConfirmDialogComponent,
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
  /** Dati dell'ultimo snapshot, su cui si fondono gli aggiornamenti parziali. */
  private lastData: DashboardOverviewData | null = null;
  /** Sezioni che il server non è riuscito a caricare nell'ultimo snapshot. */
  failedSections: ReadonlySet<OverviewSection> = new Set();
  /** L'intera richiesta è fallita (rete, 401, 5xx): si tengono i dati precedenti e lo si dice. */
  loadFailed = false;
  /** Refresh successivi al primo: niente schermata di caricamento, solo l'icona che gira. */
  refreshing = false;
  private readonly document = inject(DOCUMENT);
  private readonly notifications = inject(AdminNotificationsService);
  private dataSubscription: Subscription | null = null;
  /** Ultima notifica già gestita: l'effect parte anche alla creazione, senza eventi nuovi. */
  private lastNotification: unknown = null;

  /** Notifica admin in tempo reale → ricarica solo contatori, messaggi, chat live e lead. */
  private readonly onAdminNotification = effect(() => {
    const latest = this.notifications.recent()[0] ?? null;
    if (latest === this.lastNotification) return;
    this.lastNotification = latest;
    if (latest) untracked(() => this.loadLive());
  });

  /** Sezioni aperte dell'accordion (memorizzate nel browser). */
  readonly openSections = signal<ReadonlySet<string>>(loadOpenSections());

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
    this.lastNotification = this.notifications.recent()[0] ?? null;
    this.loadData();
  }

  ngOnDestroy(): void {
    this.dataSubscription?.unsubscribe();
  }

  /** Indice delle sezioni: la SEO compare solo se Search Console è configurato, i messaggi solo se ce ne sono. */
  /** Numeri chiave: visite, visitatori, contatti, utenti. */
  get primaryStats(): StatCard[] {
    return PRIMARY_STATS.map(key => this.stats.find(s => s.labelKey === key)).filter((s): s is StatCard => !!s);
  }

  /** Il resto (progetti, esperienze, articoli…), in forma compatta. */
  get compactStats(): StatCard[] {
    return this.stats.filter(s => !(PRIMARY_STATS as readonly string[]).includes(s.labelKey));
  }

  /** Cose che richiedono un'azione adesso, dalla più urgente. Vuota = tutto a posto. */
  get attention(): AttentionItem[] {
    const items: AttentionItem[] = [];
    const waiting = this.liveHandoffWaiting;
    if (waiting.length) {
      items.push({ id: 'live', icon: 'support_agent', count: waiting.length, labelKey: 'dash_v2.att_live', tone: 'bad', route: this.liveHandoffRoute(waiting[0]) });
    }
    if (this.unreadCount > 0) {
      items.push({ id: 'unread', icon: 'mark_email_unread', count: this.unreadCount, labelKey: 'dash_v2.att_unread', tone: 'warn', route: ['/dashboard/contacts'] });
    }
    const followUps = this.leads?.followUpsDue ?? 0;
    if (followUps > 0) {
      items.push({ id: 'followups', icon: 'schedule', count: followUps, labelKey: 'dash_v2.att_followups', tone: 'warn', section: 'dash-leads' });
    }
    const errors = this.serverErrors?.open ?? 0;
    if (errors > 0) {
      items.push({ id: 'errors', icon: 'bug_report', count: errors, labelKey: 'dash_v2.att_errors', tone: 'bad', section: 'dash-ops' });
    }
    const broken = this.notFound?.open ?? 0;
    if (broken > 0) {
      items.push({ id: 'broken', icon: 'link_off', count: broken, labelKey: 'dash_v2.att_broken', tone: 'info', section: 'dash-content' });
    }
    const translations = this.translationHealth?.postsWithIssues ?? 0;
    if (translations > 0) {
      items.push({ id: 'translations', icon: 'translate', count: translations, labelKey: 'dash_v2.att_translations', tone: 'info', section: 'dash-content' });
    }
    return items;
  }

  /** Riassunto per l'intestazione di una sezione (visibile anche da chiusa). */
  badgesFor(id: string): SectionBadge[] {
    const out: SectionBadge[] = [];
    switch (id) {
      case 'dash-ops': {
        const errors = this.serverErrors?.open ?? 0;
        const warnings = this.serverHealth?.warnings.length ?? 0;
        out.push({ icon: 'bug_report', value: errors, labelKey: 'dash_v2.b_errors', tone: errors ? 'bad' : 'ok' });
        if (warnings) out.push({ icon: 'error_outline', value: warnings, labelKey: 'dash_v2.b_warnings', tone: 'warn' });
        break;
      }
      case 'dash-content': {
        const tr = this.translationHealth?.postsWithIssues ?? 0;
        const nf = this.notFound?.open ?? 0;
        const sch = this.scheduledPosts.length;
        if (tr) out.push({ icon: 'translate', value: tr, labelKey: 'dash_v2.b_translations', tone: 'warn' });
        if (nf) out.push({ icon: 'link_off', value: nf, labelKey: 'dash_v2.b_broken', tone: 'info' });
        if (sch) out.push({ icon: 'schedule', value: sch, labelKey: 'dash_v2.b_scheduled', tone: 'info' });
        break;
      }
      case 'dash-activity':
        out.push({ icon: 'article', value: this.publishedPosts, labelKey: 'dash_v2.b_published', tone: 'info' });
        if (this.draftPosts) out.push({ icon: 'edit', value: this.draftPosts, labelKey: 'dash_v2.b_drafts', tone: 'info' });
        break;
      case 'dash-visitors':
        out.push({ icon: 'person', value: this.todayVisitors, labelKey: 'dash_v2.b_today', tone: 'info' });
        break;
      case 'dash-seo':
        if (this.gscSummary.configured) out.push({ icon: 'trending_up', value: this.gscSummary.clicks, labelKey: 'dash_v2.b_clicks', tone: 'info' });
        break;
    }
    return out;
  }

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

  isOpen(id: string): boolean {
    return this.openSections().has(id);
  }

  setOpen(id: string, open: boolean): void {
    if (this.isOpen(id) === open) return;
    const next = new Set(this.openSections());
    if (open) next.add(id);
    else next.delete(id);
    this.updateOpenSections(next);
  }

  expandAll(): void {
    this.updateOpenSections(new Set(COLLAPSIBLE_SECTIONS));
  }

  collapseAll(): void {
    this.updateOpenSections(new Set());
  }

  /** Dall'indice: apre la sezione se è chiusa, poi ci porta. */
  scrollTo(id: string): void {
    this.setOpen(id, true);
    // Un frame per lasciare al pannello il tempo di aprirsi e creare il contenuto.
    setTimeout(() => this.document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  private updateOpenSections(next: ReadonlySet<string>): void {
    this.openSections.set(next);
    saveOpenSections(next);
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

  loadData(fresh = false): void {
    this.refreshing = !this.loading;
    this.dataSubscription?.unsubscribe();
    this.dataSubscription = this.adminDashboard.loadOverview(fresh).subscribe({
      next: (overview) => {
        // I pannelli Provenienza e Contatti caricano da soli: al giro completo si aggiornano anche loro.
        if (this.lastData) this.acquisitionSection()?.reload();
        this.applyOverview(overview);
      },
      error: () => this.onLoadError(),
    });
  }

  /** Solo le sezioni toccate da una notifica, fuse con lo snapshot in pagina. */
  private loadLive(): void {
    if (!this.lastData) return;
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
      { labelKey: 'admin.visitors',    value: coreValue(adminStats.visits.uniqueVisitors),                   icon: 'person',             route: '/dashboard',             color: '#ef4444', spark: null },
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

  /** Dal pannello Utility: apre la sezione chat, carica le chat di oggi e ci porta. */
  loadTodaySessions(): void {
    this.scrollTo('dash-chat');
    // La sezione chat si crea all'apertura del pannello: si carica al frame successivo.
    setTimeout(() => this.chatSessions()?.load());
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
