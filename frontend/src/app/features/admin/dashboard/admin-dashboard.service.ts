import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { DonutItem } from '../../../shared/components/donut-chart/donut-chart.component';

// ── Exported types (shared between service and component) ──────────────────────

export interface RecentContact {
  _id?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read?: boolean;
  repliedAt?: string | null;
  replyText?: string | null;
}

/** Sessione di chat live che Gent può (ri)aprire dalla dashboard. */
export interface LiveHandoffSession {
  requestId: string;
  sessionId: string;
  status: 'requested' | 'notified' | 'agent_joining' | 'live';
  lastUserMessage: string | null;
  locale: string | null;
  requestedAt: string;
  expiresAt: string;
}

interface AdminStatsResponse {
  users: number;
  contacts: number;
  unreadContacts: number;
  recentContacts: RecentContact[];
  contactsByDay: Array<{ date: string; count: number }>;
  content: { total: number; published: number; drafts: number };
  visits: { totalViews: number; uniqueVisitors: number; viewsByDay: Array<{ date: string; count: number }> };
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

export interface TopPage { label: string; count: number; }

export interface ToolConversionRow {
  tool: string;
  uniqueVisitors: number;
  becameLead: number;
  conversionRate: number;
}
export interface MonthlyHistoryEntry { month: string; views: number; }

export interface AuditLogEntry {
  _id?: string;
  actorEmail: string;
  method: string;
  path: string;
  resource: string;
  description: string;
  statusCode: number;
  createdAt: string;
}

export interface GscQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleSummary {
  configured: boolean;
  clicks: number;
  impressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: GscQuery[];
}

export interface ChatbotStats {
  totalSessions: number;
  totalMessages: number;
  interactionsToday: number;
  sessionsThisMonth: number;
  fallbackRepliesToday: number;
}

export interface SystemHealth {
  ok: boolean;
  service: string;
  version: string;
  startedAt: string;
  environment: string;
}

export interface SystemDetails {
  service: string;
  version: string;
  startedAt: string;
  environment: string;
  commitSha: string | null;
  branch: string | null;
  railway: {
    serviceId: string | null;
    serviceName: string | null;
    environmentId: string | null;
    projectId: string | null;
  };
  features: Record<string, boolean>;
}

export interface OperationsInfo {
  uptimeSeconds: number;
  memoryRssMb: number;
  nodeVersion: string;
  mail: {
    configured: boolean;
    provider: 'resend' | 'smtp' | 'none';
    smtpUser: string | null;
  };
  cronJobs: Array<{ name: string; nextRun: string | null; running: boolean }>;
}

export interface AiUsageOverview {
  date: string;
  tokens: number;
  calls: number;
  byEndpoint: Array<{ endpoint: string; calls: number }>;
  tokensBySource: { tools: number; chatbot: number };
  rejectedIpCap: number;
  rejectedBudget: number;
  cappedIps: number;
  history: Array<{ date: string; tokens: number; calls: number }>;
  quota: { dailyTokenBudget: number; maxCallsPerIpPerDay: number };
  enabled: boolean;
}

export interface ServerErrorView {
  _id: string;
  method: string;
  route: string;
  path: string;
  status: number;
  name: string;
  message: string;
  stack: string;
  count: number;
  today: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface ServerErrorSummary {
  open: number;
  today: number;
  week: number;
  recent: ServerErrorView[];
}

export interface WorkflowRun {
  name: string;
  conclusion: string | null;
  status: string;
  at: string;
  url: string;
}

export interface ServerHealth {
  backups: {
    configured: boolean;
    dir: string;
    count: number;
    totalBytes: number;
    latest: { file: string; sizeBytes: number; at: string; ageHours: number } | null;
    stale: boolean;
  };
  memory: { totalMb: number; availableMb: number; usedPct: number; low: boolean };
  disk: { path: string; totalGb: number; freeGb: number; usedPct: number; low: boolean } | null;
  mongo: { residentMb: number | null; connections: number | null; uptimeHours: number | null };
  load: number[];
  github: {
    configured: boolean;
    offsiteBackup: WorkflowRun | null;
    uptime: { last: WorkflowRun | null; successPct: number | null; checks: number };
  };
  /** backup_stale | memory_low | disk_low | offsite_backup_failed | uptime_failed */
  warnings: string[];
}

export type TranslationLang = 'en' | 'sq' | 'pt' | 'es' | 'fr' | 'de';

export interface TranslationIssue {
  lang: TranslationLang;
  kind: 'missing' | 'stale' | 'structure';
  detail?: string[];
}

export interface TranslationHealth {
  posts: number;
  postsWithIssues: number;
  missing: number;
  stale: number;
  structure: number;
  byLang: Record<TranslationLang, { missing: number; stale: number; structure: number }>;
  items: Array<{ _id: string; title: string; slug: string; published: boolean; issues: TranslationIssue[] }>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatbotSession {
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

export interface ContactsPage {
  data: RecentContact[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ConsentStats {
  total: number;
  analytics: number;
  marketing: number;
  preferences: number;
  analyticsRate: number;
  marketingRate: number;
  preferencesRate: number;
}

// ── Default / empty values ─────────────────────────────────────────────────────

const EMPTY_STATS: AdminStatsResponse = {
  users: 0, contacts: 0, unreadContacts: 0, recentContacts: [],
  contactsByDay: [],
  content: { total: 0, published: 0, drafts: 0 },
  visits: { totalViews: 0, uniqueVisitors: 0, viewsByDay: [] },
};

const EMPTY_ADVANCED: AdvancedAnalytics = {
  todayCount: 0, topLocations: [], topCountries: [],
  deviceBreakdown: [], browserBreakdown: [], osBreakdown: [], trafficSources: [],
};

const EMPTY_ANALYTICS_STATS: AnalyticsStats = {
  totalViews: 0, monthlyViews: 0,
  locations: [], monthlyLocations: [], devices: [], monthlyDevices: [], lastResetAt: null,
};

const EMPTY_CHATBOT_STATS: ChatbotStats = {
  totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0, fallbackRepliesToday: 0,
};

const EMPTY_CONSENT: ConsentStats = {
  total: 0, analytics: 0, marketing: 0, preferences: 0, analyticsRate: 0, marketingRate: 0, preferencesRate: 0,
};

const EMPTY_AI_USAGE: AiUsageOverview = {
  date: '', tokens: 0, calls: 0, byEndpoint: [], tokensBySource: { tools: 0, chatbot: 0 },
  rejectedIpCap: 0, rejectedBudget: 0, cappedIps: 0, history: [],
  quota: { dailyTokenBudget: 0, maxCallsPerIpPerDay: 0 }, enabled: true,
};

const EMPTY_SERVER_ERRORS: ServerErrorSummary = { open: 0, today: 0, week: 0, recent: [] };

const EMPTY_LANG_COUNTS = { missing: 0, stale: 0, structure: 0 };
const EMPTY_TRANSLATION_HEALTH: TranslationHealth = {
  posts: 0, postsWithIssues: 0, missing: 0, stale: 0, structure: 0, items: [],
  byLang: { en: EMPTY_LANG_COUNTS, sq: EMPTY_LANG_COUNTS, pt: EMPTY_LANG_COUNTS, es: EMPTY_LANG_COUNTS, fr: EMPTY_LANG_COUNTS, de: EMPTY_LANG_COUNTS },
};

const EMPTY_GSC: SearchConsoleSummary = {
  configured: false, clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0, topQueries: [],
};

// ── Overview (GET /stats/overview) ─────────────────────────────────────────────

export interface TopPost { _id: string; title: string; slug: string; viewCount?: number; }

export interface DashboardOverviewData {
  core: AdminStatsResponse;
  projectsCount: number;
  experiencesCount: number;
  topPosts: TopPost[];
  advanced: AdvancedAnalytics;
  analyticsStats: AnalyticsStats;
  topPages: TopPage[];
  monthlyHistory: MonthlyHistoryEntry[];
  toolConversion: ToolConversionRow[];
  auditLogs: AuditLogEntry[];
  chatbotStats: ChatbotStats;
  gsc: SearchConsoleSummary;
  consentStats: ConsentStats;
  liveHandoffs: LiveHandoffSession[];
  systemHealth: SystemHealth | null;
  systemDetails: SystemDetails | null;
  systemOps: OperationsInfo | null;
  aiUsage: AiUsageOverview;
  serverErrors: ServerErrorSummary;
  serverHealth: ServerHealth | null;
  translationHealth: TranslationHealth;
}

export type OverviewSection = keyof DashboardOverviewData;

export interface DashboardOverview {
  data: DashboardOverviewData;
  /** Sezioni fallite lato server: il template mostra un errore lì, non zeri. */
  failed: ReadonlySet<OverviewSection>;
  generatedAt: string;
}

interface RawOverview {
  generatedAt: string;
  sections: Partial<Record<OverviewSection, unknown>>;
  errors: string[];
}

const OVERVIEW_DEFAULTS: DashboardOverviewData = {
  core: EMPTY_STATS,
  projectsCount: 0,
  experiencesCount: 0,
  topPosts: [],
  advanced: EMPTY_ADVANCED,
  analyticsStats: EMPTY_ANALYTICS_STATS,
  topPages: [],
  monthlyHistory: [],
  toolConversion: [],
  auditLogs: [],
  chatbotStats: EMPTY_CHATBOT_STATS,
  gsc: EMPTY_GSC,
  consentStats: EMPTY_CONSENT,
  liveHandoffs: [],
  systemHealth: null,
  systemDetails: null,
  systemOps: null,
  aiUsage: EMPTY_AI_USAGE,
  serverErrors: EMPTY_SERVER_ERRORS,
  serverHealth: null,
  translationHealth: EMPTY_TRANSLATION_HEALTH,
};

/**
 * Riempie i buchi con valori vuoti (così il template non deve gestire null
 * ovunque) ma tiene traccia di cosa è fallito davvero: una sezione mancante
 * o null è "fallita" anche se il server non l'ha elencata in `errors`.
 */
export function normalizeOverview(raw: RawOverview): DashboardOverview {
  const failed = new Set<OverviewSection>();
  const data = { ...OVERVIEW_DEFAULTS } as Record<OverviewSection, unknown>;
  const nullable = new Set<OverviewSection>(['systemHealth', 'systemDetails', 'systemOps']);

  for (const key of Object.keys(OVERVIEW_DEFAULTS) as OverviewSection[]) {
    const value = raw.sections?.[key];
    const missing = raw.errors?.includes(key) || value === undefined || (value === null && !nullable.has(key));
    if (missing) {
      failed.add(key);
      continue;
    }
    data[key] = value;
  }
  return { data: data as unknown as DashboardOverviewData, failed, generatedAt: raw.generatedAt };
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Tutta la dashboard in una richiesta (GET /stats/overview, cache 30s lato
   * server). Prima erano ~17 richieste parallele a ogni refresh, ognuna con
   * catchError → zeri: un 401 o un servizio giù mostrava numeri finti invece
   * di un errore. `fresh` salta la cache (pulsante "Aggiorna").
   */
  loadOverview(fresh = false): Observable<DashboardOverview> {
    const url = `${this.api}/stats/overview${fresh ? '?fresh=1' : ''}`;
    return this.http.get<RawOverview>(url).pipe(map(normalizeOverview));
  }

  getConsentStats() {
    return this.http.get<ConsentStats>(`${this.api}/consent/stats`).pipe(catchError(() => of(EMPTY_CONSENT)));
  }

  getConsentHistory(limit = 100, skip = 0) {
    return this.http.get<any[]>(`${this.api}/consent/history?limit=${limit}&skip=${skip}`).pipe(catchError(() => of([])));
  }

  getStats(): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>(`${this.api}/stats`).pipe(
      catchError(() => of(EMPTY_STATS)),
    );
  }

  /** Inbox contatti (/dashboard/contacts): paginata, filtro non letti e ricerca. */
  listContacts(opts: { page: number; limit: number; unreadOnly?: boolean; q?: string }): Observable<ContactsPage> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.unreadOnly) params = params.set('unreadOnly', 'true');
    if (opts.q?.trim()) params = params.set('q', opts.q.trim());
    return this.http.get<ContactsPage>(`${this.api}/contact`, { params });
  }

  markContactRead(contactId: string, read: boolean = true): Observable<RecentContact> {
    return this.http.patch<RecentContact>(`${this.api}/contact/${contactId}/read`, { read });
  }

  deleteContact(contactId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.api}/contact/${contactId}`);
  }

  bulkDeleteContacts(ids: string[]): Observable<{ success: boolean; deleted: number }> {
    return this.http.post<{ success: boolean; deleted: number }>(`${this.api}/contact/bulk-delete`, { ids });
  }

  replyToContact(contactId: string, replyText: string): Observable<{ repliedAt: string }> {
    return this.http.post<{ repliedAt: string }>(`${this.api}/contact/${contactId}/reply`, { replyText });
  }

  getTodaySessions(page: number): Observable<ChatbotSessionsPage> {
    return this.http.get<ChatbotSessionsPage>(`${this.api}/chatbot/sessions/today?page=${page}&limit=10`);
  }

  resetMonthlyStats(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.api}/analytics/reset`, {});
  }

  exportAnalyticsCsv(): Observable<Blob> {
    return this.http.get(`${this.api}/analytics/export/csv`, { responseType: 'blob' });
  }

  /** Segna risolto un gruppo di errori 5xx: torna aperto se si ripete. */
  resolveServerError(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.api}/system/errors/${id}/resolve`, {});
  }

  resolveAllServerErrors(): Observable<{ resolved: number }> {
    return this.http.post<{ resolved: number }>(`${this.api}/system/errors/resolve-all`, {});
  }

  getToolConversion(days = 30): Observable<ToolConversionRow[]> {
    return this.http.get<ToolConversionRow[]>(`${this.api}/analytics/tool-conversion?days=${days}`);
  }
}
