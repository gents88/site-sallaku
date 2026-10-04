import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ContactService } from '../contact/contact.service';
import { BlogService } from '../blog/blog.service';
import { ProjectsService } from '../projects/projects.service';
import { ExperiencesService } from '../experiences/experiences.service';
import { AnalyticsQueryService } from '../analytics/services/analytics-query.service';
import { AnalyticsExportService } from '../analytics/services/analytics-export.service';
import { SearchConsoleService } from '../analytics/search-console.service';
import { AuditService } from '../audit/audit.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { ConsentService } from '../consent/consent.service';
import { LiveHandoffService } from '../live-handoff/live-handoff.service';
import { SystemInfoService } from '../system/system-info.service';
import { TestimonialsService } from '../testimonials/services/testimonials.service';
import { NotesService } from '../notes/services/notes.service';

interface StatsContactPoint {
  date: string;
  count: number;
}

interface StatsContentSummary {
  total: number;
  published: number;
  drafts: number;
}

export interface AdminDashboardStatsResponse {
  users: number;
  contacts: number;
  unreadContacts: number;
  recentContacts: Awaited<ReturnType<ContactService['findAll']>>;
  contactsByDay: StatsContactPoint[];
  content: StatsContentSummary;
  visits: {
    totalViews: number;
    uniqueVisitors: number;
    viewsByDay: StatsContactPoint[];
  };
}

export interface NotificationSummary {
  contactsUnread: number;
  testimonialsPending: number;
  notesPending: number;
  liveHandoffsWaiting: number;
}

/** TTL breve: la dashboard fa polling ogni 60s e più schede aperte condividono lo stesso snapshot. */
export const OVERVIEW_TTL_MS = 30_000;

type Loader = () => unknown | Promise<unknown>;

export interface AdminOverviewResponse {
  generatedAt: string;
  /** Una chiave per pannello; null se quel pannello è fallito (elencato in `errors`). */
  sections: Record<string, unknown>;
  /** Pannelli falliti: il frontend mostra un errore lì invece di zeri finti. */
  errors: string[];
}

/**
 * Snapshot unico della dashboard admin: prima il frontend faceva ~17
 * richieste al minuto (una per pannello) contro un throttle globale di 60/min
 * per IP — con tre schede aperte si finiva in 429. Ogni sezione è isolata:
 * un servizio che fallisce svuota solo il proprio pannello.
 */
@Injectable()
export class AdminOverviewService {
  private readonly logger = new Logger(AdminOverviewService.name);
  private cached: { at: number; value: AdminOverviewResponse } | null = null;
  private inFlight: Promise<AdminOverviewResponse> | null = null;

  constructor(
    private readonly users: UsersService,
    private readonly contacts: ContactService,
    private readonly blog: BlogService,
    private readonly projects: ProjectsService,
    private readonly experiences: ExperiencesService,
    private readonly analytics: AnalyticsQueryService,
    private readonly analyticsExport: AnalyticsExportService,
    private readonly searchConsole: SearchConsoleService,
    private readonly audit: AuditService,
    private readonly chatbot: ChatbotService,
    private readonly consent: ConsentService,
    private readonly liveHandoff: LiveHandoffService,
    private readonly systemInfo: SystemInfoService,
    private readonly testimonials: TestimonialsService,
    private readonly notes: NotesService,
  ) {}

  /**
   * Contatori del campanello admin: cose che aspettano un'azione. Letto al
   * login e ricaricato a ogni evento WebSocket 'admin_notification'.
   */
  async notificationSummary(): Promise<NotificationSummary> {
    const [contactsUnread, testimonialStats, pendingNotes, active] = await Promise.all([
      this.contacts.countUnread(),
      this.testimonials.getStats(),
      this.notes.getAllForAdmin('pending', 1, 0),
      this.liveHandoff.listActive(),
    ]);
    return {
      contactsUnread,
      testimonialsPending: testimonialStats.pending,
      notesPending: pendingNotes.total,
      liveHandoffsWaiting: active.filter((h) => h.status === 'requested' || h.status === 'notified').length,
    };
  }

  /** Le statistiche aggregate storiche di GET /stats (stessa forma di prima). */
  async coreStats(): Promise<AdminDashboardStatsResponse> {
    const [userCount, contactCount, unreadContactCount, recentContacts, contactsByDay, content, visits] = await Promise.all([
      this.users.count(),
      this.contacts.count(),
      this.contacts.countUnread(),
      this.contacts.findAll(10),
      this.contacts.countByDay(7),
      this.blog.getContentSummary(),
      this.analytics.getVisitSummary(7),
    ]);

    return {
      users: userCount,
      contacts: contactCount,
      unreadContacts: unreadContactCount,
      recentContacts,
      contactsByDay,
      content,
      visits,
    };
  }

  async getOverview(fresh = false, now = Date.now()): Promise<AdminOverviewResponse> {
    if (!fresh && this.cached && now - this.cached.at < OVERVIEW_TTL_MS) return this.cached.value;
    // Richieste concorrenti (più schede allo scadere del TTL) condividono un solo calcolo.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.build()
      .then((value) => {
        // Uno snapshot parziale non va in cache: al prossimo giro si riprova subito.
        this.cached = value.errors.length === 0 ? { at: Date.now(), value } : null;
        return value;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async build(): Promise<AdminOverviewResponse> {
    const loaders: Record<string, Loader> = {
      core: () => this.coreStats(),
      projectsCount: async () => (await this.projects.findAll()).length,
      experiencesCount: async () => (await this.experiences.findAll()).length,
      topPosts: () => this.blog.getTopPostsByViews(5),
      advanced: () => this.analytics.getAdvancedAnalytics(),
      analyticsStats: () => this.analytics.getAnalyticsStats(),
      topPages: () => this.analytics.getTopPages(10),
      monthlyHistory: () => this.analyticsExport.getMonthlyHistory(6),
      toolConversion: () => this.analytics.getToolConversionFunnel(30),
      auditLogs: () => this.audit.findRecent({ limit: 10 }),
      chatbotStats: () => this.chatbot.getChatbotStats(),
      gsc: () => this.searchConsole.getSummary(),
      consentStats: () => this.consent.stats(),
      liveHandoffs: () => this.liveHandoff.listActive(),
      systemHealth: () => this.systemInfo.health(),
      systemDetails: () => this.systemInfo.version(),
      systemOps: () => this.systemInfo.ops(),
    };

    const keys = Object.keys(loaders);
    const settled = await Promise.allSettled(keys.map((k) => Promise.resolve().then(loaders[k])));

    const sections: Record<string, unknown> = {};
    const errors: string[] = [];
    settled.forEach((result, i) => {
      const key = keys[i];
      if (result.status === 'fulfilled') {
        sections[key] = result.value;
      } else {
        sections[key] = null;
        errors.push(key);
        this.logger.warn(`Overview section "${key}" failed: ${(result.reason as Error)?.message ?? result.reason}`);
      }
    });

    return { generatedAt: new Date().toISOString(), sections, errors };
  }
}
