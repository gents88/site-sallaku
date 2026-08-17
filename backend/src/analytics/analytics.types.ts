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
