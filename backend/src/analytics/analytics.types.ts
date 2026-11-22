export interface ViewsByDayPoint {
  date: string;
  count: number;
}

export interface VisitSummary {
  totalViews: number;
  uniqueVisitors: number;
  viewsByDay: ViewsByDayPoint[];
}

export interface BreakdownItem {
  label: string;
  count: number;
}

export interface ToolConversionRow {
  tool: string;
  uniqueVisitors: number;
  becameLead: number;
  conversionRate: number;
}

export interface AnalyticsStatsResponse {
  totalViews: number;
  monthlyViews: number;
  locations: Array<{ label: string; count: number }>;
  monthlyLocations: Array<{ label: string; count: number }>;
  devices: Array<{ label: string; count: number }>;
  monthlyDevices: Array<{ label: string; count: number }>;
  lastResetAt: Date | null;
}

export interface PageEngagement {
  path: string;
  views: number;
  uniqueVisitors: number;
  /** Average views per visitor for this page (views / uniqueVisitors) */
  viewsPerVisitor: number;
  /** Visitors who opened this page 2+ times today */
  repeatVisitors: number;
  /** Average dwell time in seconds, null when no view reported a duration */
  avgDurationSec: number | null;
}

export interface DailyEngagementReport {
  pages: PageEngagement[];
  /** Today's traffic-source breakdown (direct/search/social/referral/internal/campaign) */
  sources: BreakdownItem[];
  /** External referrer hosts seen today */
  topReferrers: BreakdownItem[];
  /** UTM campaigns seen today, labeled "source / campaign" */
  campaigns: BreakdownItem[];
  /** "City, Country" breakdown of today's visits */
  locations: BreakdownItem[];
  newVisitors: number;
  returningVisitors: number;
}

export interface AdvancedAnalytics {
  todayCount: number;
  topLocations: BreakdownItem[];
  topCountries: BreakdownItem[];
  deviceBreakdown: BreakdownItem[];
  browserBreakdown: BreakdownItem[];
  osBreakdown: BreakdownItem[];
  trafficSources: BreakdownItem[];
}

/** Pagina da cui i visitatori sono entrati nel sito, con la ripartizione per sorgente. */
export interface EntryPageRow {
  path: string;
  /** Arrivi totali su questa pagina (prima pagina della visita) */
  entries: number;
  /** Arrivi per sorgente: { search: 12, social: 3, direct: 5, … } */
  sources: Record<string, number>;
}

/** Una visita (sessione) recente: da dove è arrivata, dove è entrata, quanto ha visto. */
export interface RecentVisit {
  at: string;
  trafficSource: string;
  /** Host del sito di provenienza (google.com, linkedin.com…), '' se diretto */
  referrerHost: string;
  utmSource: string;
  entryPath: string;
  country: string;
  city: string;
  deviceType: string;
  /** Pagine viste nella visita (1 se la sessione non è tracciabile) */
  pages: number;
  /** Tempo attivo totale della visita in secondi, null se non riportato */
  durationSec: number | null;
}

export interface AcquisitionReport {
  days: number;
  /** Arrivi dall'esterno nel periodo (prime pagine delle visite) */
  totalEntries: number;
  sources: BreakdownItem[];
  /** Siti di provenienza raggruppati per host, senza il dominio del sito */
  referrers: BreakdownItem[];
  entryPages: EntryPageRow[];
  recentVisits: RecentVisit[];
}
