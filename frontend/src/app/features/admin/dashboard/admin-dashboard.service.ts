import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, startWith } from 'rxjs/operators';
import { combineLatest } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DonutItem } from '../../../shared/components/donut-chart/donut-chart.component';
import { Post } from '../../../core/models/post.model';

// ── Exported types (shared between service and component) ──────────────────────

export interface RecentContact {
  _id?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read?: boolean;
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

interface ConsentStats {
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
  totalSessions: 0, totalMessages: 0, interactionsToday: 0, sessionsThisMonth: 0,
};

const EMPTY_GSC: SearchConsoleSummary = {
  configured: false, clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0, topQueries: [],
};

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Returns a combineLatest of all dashboard data sources. */
  loadAll(
    projects$: Observable<unknown[]>,
    experiences$: Observable<unknown[]>,
    blogPosts$: Observable<Post[]>,
  ) {
    return combineLatest({
      projects: projects$.pipe(catchError(() => of([])), startWith([])),
      experiences: experiences$.pipe(catchError(() => of([])), startWith([])),
      blogPosts: blogPosts$.pipe(catchError(() => of([])), startWith([])),
      adminStats: this.http.get<AdminStatsResponse>(`${this.api}/stats`).pipe(
        catchError(() => of(EMPTY_STATS)), startWith(EMPTY_STATS),
      ),
      advanced: this.http.get<AdvancedAnalytics>(`${this.api}/analytics/advanced`).pipe(
        catchError(() => of(EMPTY_ADVANCED)), startWith(EMPTY_ADVANCED),
      ),
      analyticsStats: this.http.get<AnalyticsStats>(`${this.api}/analytics`).pipe(
        catchError(() => of(EMPTY_ANALYTICS_STATS)), startWith(EMPTY_ANALYTICS_STATS),
      ),
      topPages: this.http.get<TopPage[]>(`${this.api}/analytics/top-pages`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      monthlyHistory: this.http.get<MonthlyHistoryEntry[]>(`${this.api}/analytics/monthly-history`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      auditLogs: this.http.get<AuditLogEntry[]>(`${this.api}/audit?limit=10`).pipe(
        catchError(() => of([])), startWith([]),
      ),
      chatbotStats: this.http.get<ChatbotStats>(`${this.api}/chatbot/stats`).pipe(
        catchError(() => of(EMPTY_CHATBOT_STATS)), startWith(EMPTY_CHATBOT_STATS),
      ),
      systemHealth: this.http.get<SystemHealth>(`${this.api}/system/health`).pipe(
        catchError(() => of(null as SystemHealth | null)), startWith(null as SystemHealth | null),
      ),
      systemDetails: this.http.get<SystemDetails>(`${this.api}/system/version`).pipe(
        catchError(() => of(null as SystemDetails | null)), startWith(null as SystemDetails | null),
      ),
      systemOps: this.http.get<OperationsInfo>(`${this.api}/system/ops`).pipe(
        catchError(() => of(null as OperationsInfo | null)), startWith(null as OperationsInfo | null),
      ),
      gsc: this.http.get<SearchConsoleSummary>(`${this.api}/analytics/search-console`).pipe(
        catchError(() => of(EMPTY_GSC)), startWith(EMPTY_GSC),
      ),
      consentStats: this.http.get<ConsentStats>(`${this.api}/consent/stats`).pipe(
        catchError(() => of({ total:0, analytics:0, marketing:0, preferences:0, analyticsRate:0, marketingRate:0, preferencesRate:0 } as ConsentStats)), startWith({ total:0, analytics:0, marketing:0, preferences:0, analyticsRate:0, marketingRate:0, preferencesRate:0 } as ConsentStats),
      ),
    });
  }

  getConsentStats() {
    return this.http.get<ConsentStats>(`${this.api}/consent/stats`).pipe(catchError(() => of({ total:0, analytics:0, marketing:0, preferences:0, analyticsRate:0, marketingRate:0, preferencesRate:0 } as ConsentStats)));
  }

  getConsentHistory(limit = 100, skip = 0) {
    return this.http.get<any[]>(`${this.api}/consent/history?limit=${limit}&skip=${skip}`).pipe(catchError(() => of([])));
  }

  getStats(): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>(`${this.api}/stats`).pipe(
      catchError(() => of(EMPTY_STATS)),
    );
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
}
