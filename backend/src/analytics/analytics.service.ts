import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import * as geoip from 'geoip-lite';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { TrackPageLeaveDto } from './dto/track-page-leave.dto';
import { TrackClickEventDto } from './dto/track-click-event.dto';
import { PageView, PageViewDocument } from './schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsDocument } from './schemas/analytics-stats.schema';
import { MonthlyHistory, MonthlyHistoryDocument } from './schemas/monthly-history.schema';
import { ClickEvent, ClickEventDocument } from './schemas/click-event.schema';
import { CacheService } from '../common/services/cache.service';

interface ViewsByDayPoint {
  date: string;
  count: number;
}

interface VisitSummary {
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

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
    @InjectModel(AnalyticsStats.name)
    private analyticsStatsModel: Model<AnalyticsStatsDocument>,
    @InjectModel(MonthlyHistory.name)
    private monthlyHistoryModel: Model<MonthlyHistoryDocument>,
    @InjectModel(ClickEvent.name)
    private clickEventModel: Model<ClickEventDocument>,
    private readonly cache: CacheService,
  ) {}

  async trackPageView(dto: TrackPageViewDto, req?: Request): Promise<{ success: boolean }> {
    const rawIp = this.extractRawIp(req);
    const anonymizedIp = this.anonymizeIp(rawIp);
    const userAgent = (req?.headers['user-agent'] as string) ?? dto.userAgent ?? '';
    const { country, city, region } = this.resolveGeo(rawIp);
    const { deviceType, browser, os } = this.parseUserAgent(userAgent);
    const navigationType = dto.navigationType === 'internal' ? 'internal' : 'entry';
    const trafficSource = this.resolveTrafficSource(navigationType, dto.referrer ?? '', dto.utmSource);

    await this.pageViewModel.create({
      visitorId: dto.visitorId,
      path: dto.path,
      referrer: dto.referrer ?? '',
      language: dto.language ?? '',
      userAgent,
      ip: anonymizedIp,
      country,
      city,
      region,
      deviceType,
      browser,
      os,
      trafficSource,
      viewId: dto.viewId ?? '',
      sessionId: dto.sessionId ?? '',
      navigationType,
      utmSource: dto.utmSource ?? '',
      utmMedium: dto.utmMedium ?? '',
      utmCampaign: dto.utmCampaign ?? '',
    });

    // Update the pre-aggregated stats singleton
    await this.incrementStats(country, deviceType);

    // Bust summary caches so the next dashboard load sees fresh counts
    this.cache.invalidatePrefix('analytics:');
    return { success: true };
  }

  /** Attaches dwell time to an existing page view. $max lets late beacons only increase it. */
  async trackPageLeave(dto: TrackPageLeaveDto): Promise<{ success: boolean }> {
    if (!dto.viewId) return { success: true };
    await this.pageViewModel
      .updateOne({ viewId: dto.viewId }, { $max: { durationMs: dto.durationMs } })
      .exec();
    return { success: true };
  }

  async getVisitSummary(days = 7): Promise<VisitSummary> {
    return this.cache.getOrSet(`analytics:visit-summary:${days}`, async () => {
      const [totalViews, uniqueVisitors, viewsByDay] = await Promise.all([
        this.pageViewModel.countDocuments().exec(),
        this.pageViewModel.distinct('visitorId').then(ids => ids.length),
        this.countViewsByDay(days),
      ]);
      return { totalViews, uniqueVisitors, viewsByDay };
    }, 60_000); // 1 minute TTL
  }

  /** Fresh (un-cached) per-day stats used by the daily summary cron job. */
  async getTodayPageViewStats(): Promise<{ todayPageViews: number; uniqueVisitorsToday: number; todayBlogViews: number }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [todayPageViews, uniqueVisitorIds, todayBlogViews] = await Promise.all([
      this.pageViewModel.countDocuments({ createdAt: { $gte: start } }).exec(),
      this.pageViewModel.distinct('visitorId', { createdAt: { $gte: start } }).exec(),
      this.pageViewModel.countDocuments({ createdAt: { $gte: start }, path: { $regex: '^/blog', $options: 'i' } }).exec(),
    ]);

    return {
      todayPageViews,
      uniqueVisitorsToday: uniqueVisitorIds.length,
      todayBlogViews,
    };
  }

  /**
   * Fresh (un-cached) engagement report for the current day, used by the 22:00 cron.
   * Answers: which pages, how often per visitor, from where, and for how long.
   */
  async getDailyEngagementReport(): Promise<DailyEngagementReport> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todayMatch = { createdAt: { $gte: start } };

    const [pages, sources, locations, referrerRows, campaigns, todayVisitorIds] = await Promise.all([
      this.aggregatePageEngagement(start, 15),
      this.aggregateByField('trafficSource', 6, todayMatch),
      this.aggregateTopLocations(8, todayMatch),
      this.pageViewModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { ...todayMatch, referrer: { $nin: ['', null] }, trafficSource: { $ne: 'internal' } } },
          { $group: { _id: '$referrer', count: { $sum: 1 } } },
        ])
        .exec(),
      this.pageViewModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { ...todayMatch, utmSource: { $nin: ['', null] } } },
          {
            $group: {
              _id: {
                $concat: [
                  '$utmSource',
                  { $cond: [{ $in: ['$utmCampaign', ['', null]] }, '', { $concat: [' / ', '$utmCampaign'] }] },
                ],
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ])
        .exec(),
      this.pageViewModel.distinct('visitorId', todayMatch).exec(),
    ]);

    // Visitors seen today that already had page views before today
    const returningVisitors = todayVisitorIds.length
      ? (await this.pageViewModel
          .distinct('visitorId', { visitorId: { $in: todayVisitorIds }, createdAt: { $lt: start } })
          .exec()).length
      : 0;

    return {
      pages,
      sources,
      topReferrers: this.mergeReferrersByHost(referrerRows, 8),
      campaigns: campaigns.map(c => ({ label: c._id ?? 'Unknown', count: c.count })),
      locations,
      newVisitors: todayVisitorIds.length - returningVisitors,
      returningVisitors,
    };
  }

  /** Per-page views, unique visitors, repeat-visit ratio and average dwell time since `start`. */
  private async aggregatePageEngagement(start: Date, limit: number): Promise<PageEngagement[]> {
    const rows = await this.pageViewModel
      .aggregate<{
        _id: string;
        views: number;
        uniqueVisitors: number;
        repeatVisitors: number;
        totalDurationMs: number;
        timedViews: number;
      }>([
        { $match: { createdAt: { $gte: start } } },
        // First pass: one row per (path, visitor) so repeat visits are countable
        {
          $group: {
            _id: { path: '$path', visitorId: '$visitorId' },
            views: { $sum: 1 },
            totalDurationMs: { $sum: '$durationMs' },
            timedViews: { $sum: { $cond: [{ $gt: ['$durationMs', 0] }, 1, 0] } },
          },
        },
        // Second pass: roll up per path
        {
          $group: {
            _id: '$_id.path',
            views: { $sum: '$views' },
            uniqueVisitors: { $sum: 1 },
            repeatVisitors: { $sum: { $cond: [{ $gt: ['$views', 1] }, 1, 0] } },
            totalDurationMs: { $sum: '$totalDurationMs' },
            timedViews: { $sum: '$timedViews' },
          },
        },
        { $sort: { views: -1 } },
        { $limit: limit },
      ])
      .exec();

    return rows.map(r => ({
      path: r._id ?? 'Unknown',
      views: r.views,
      uniqueVisitors: r.uniqueVisitors,
      viewsPerVisitor: r.uniqueVisitors ? Math.round((r.views / r.uniqueVisitors) * 10) / 10 : 0,
      repeatVisitors: r.repeatVisitors,
      avgDurationSec: r.timedViews ? Math.round(r.totalDurationMs / r.timedViews / 1000) : null,
    }));
  }

  /** Collapses raw referrer URLs into external hostnames, dropping our own domains. */
  private mergeReferrersByHost(rows: Array<{ _id: string; count: number }>, limit: number): BreakdownItem[] {
    const ownHosts = ['gentsallaku.it', 'www.gentsallaku.it', 'localhost'];
    const byHost = new Map<string, number>();

    for (const row of rows) {
      let host = row._id;
      try {
        host = new URL(row._id).hostname.replace(/^www\./, '');
      } catch {
        /* keep raw value for non-URL referrers */
      }
      if (ownHosts.includes(host)) continue;
      byHost.set(host, (byHost.get(host) ?? 0) + row.count);
    }

    return [...byHost.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getAdvancedAnalytics(): Promise<AdvancedAnalytics> {
    return this.cache.getOrSet('analytics:advanced', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayCount, topLocations, topCountries, deviceBreakdown, browserBreakdown, osBreakdown, trafficSources] =
        await Promise.all([
          this.pageViewModel.countDocuments({ createdAt: { $gte: today } }).exec(),
          this.aggregateTopLocations(10),
          this.aggregateByField('country', 10),
          this.aggregateByField('deviceType', 5),
          this.aggregateByField('browser', 8),
          this.aggregateByField('os', 6),
          this.aggregateByField('trafficSource', 4),
        ]);

      return { todayCount, topLocations, topCountries, deviceBreakdown, browserBreakdown, osBreakdown, trafficSources };
    }, 2 * 60_000); // 2 minute TTL
  }

  // ─── Pre-aggregated stats methods ──────────────────────────────────────────

  async getAnalyticsStats(): Promise<AnalyticsStatsResponse> {
    return this.cache.getOrSet('analytics:stats', async () => {
      const doc = await this.analyticsStatsModel.findOne().lean().exec();
      if (!doc) {
        return {
          totalViews: 0,
          monthlyViews: 0,
          locations: [],
          monthlyLocations: [],
          devices: [],
          monthlyDevices: [],
          lastResetAt: null,
        };
      }
      return {
        totalViews: doc.totalViews,
        monthlyViews: doc.monthlyViews,
        locations: this.recordToSortedArray(doc.locations as Record<string, number>),
        monthlyLocations: this.recordToSortedArray(doc.monthlyLocations as Record<string, number>),
        devices: this.recordToSortedArray(doc.devices as Record<string, number>),
        monthlyDevices: this.recordToSortedArray(doc.monthlyDevices as Record<string, number>),
        lastResetAt: doc.lastResetAt ?? null,
      };
    }, 30_000); // 30 s TTL
  }

  /**
   * Resets monthly stats. Saves a history snapshot first.
   * Guarded by `lastResetAt` to prevent duplicate resets within the same month.
   */
  async resetMonthlyStats(force = false): Promise<{ success: boolean; message: string }> {
    const now = new Date();
    const currentMonth = this.toMonthKey(now);
    const prevMonth = this.prevMonthKey(now);

    const current = await this.analyticsStatsModel.findOne().exec();

    // Deduplication: skip if already reset in the current calendar month
    if (!force && current?.lastResetAt) {
      const lastResetMonth = this.toMonthKey(current.lastResetAt);
      if (lastResetMonth === currentMonth) {
        this.logger.log(`[AnalyticsReset] Already reset in ${currentMonth} — skipping`);
        return { success: true, message: `Already reset for ${currentMonth} — skipped.` };
      }
    }

    // Save snapshot of previous month's data to history collection (upsert)
    const historyPayload = {
      month: prevMonth,
      views: current?.monthlyViews ?? 0,
      locations: current?.monthlyLocations ?? {},
      devices: current?.monthlyDevices ?? {},
    };
    await this.monthlyHistoryModel.findOneAndUpdate(
      { month: prevMonth },
      { $set: historyPayload },
      { upsert: true },
    );

    // Reset monthly fields in the stats singleton
    await this.analyticsStatsModel.findOneAndUpdate(
      {},
      { $set: { monthlyViews: 0, monthlyLocations: {}, monthlyDevices: {}, lastResetAt: now } },
      { upsert: true },
    );

    this.cache.invalidatePrefix('analytics:');
    this.logger.log(`[AnalyticsReset] Monthly stats reset — history saved for ${prevMonth}`);
    return { success: true, message: `Monthly stats reset. History saved for ${prevMonth}.` };
  }

  async getTopPages(limit = 10): Promise<BreakdownItem[]> {
    return this.cache.getOrSet(`analytics:top-pages:${limit}`, () =>
      this.aggregateByField('path', limit), 60_000);
  }

  async getMonthlyHistory(months = 6): Promise<Array<{ month: string; views: number }>> {
    return this.cache.getOrSet(`analytics:monthly-history:${months}`, async () => {
      const docs = await this.monthlyHistoryModel
        .find()
        .sort({ month: -1 })
        .limit(months)
        .lean()
        .exec();
      return (docs as Array<{ month: string; views: number }>).reverse();
    }, 60_000);
  }

  private async incrementStats(country: string, deviceType: string): Promise<void> {
    // Country names from Intl.DisplayNames (e.g. "Italy", "United States") are valid
    // MongoDB field name components — only dots and $ signs need escaping.
    const countryKey = country ? this.sanitizeKey(country) : 'Unknown';
    const deviceKey = deviceType || 'Unknown';

    try {
      await this.analyticsStatsModel.findOneAndUpdate(
        {},
        {
          $inc: {
            totalViews: 1,
            monthlyViews: 1,
            [`locations.${countryKey}`]: 1,
            [`monthlyLocations.${countryKey}`]: 1,
            [`devices.${deviceKey}`]: 1,
            [`monthlyDevices.${deviceKey}`]: 1,
          },
          $setOnInsert: { lastResetAt: new Date() },
        },
        { upsert: true },
      );
    } catch (err) {
      this.logger.error('[AnalyticsStats] Failed to increment stats', err as any);
    }
  }

  private recordToSortedArray(record: Record<string, number> | undefined): Array<{ label: string; count: number }> {
    if (!record) return [];
    return Object.entries(record)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }

  private sanitizeKey(key: string): string {
    // Replace dots (MongoDB path separator) and $ (operator prefix) — safe for field names
    return key.replace(/\./g, '_').replace(/\$/g, '_');
  }

  private toMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private prevMonthKey(date: Date): string {
    const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    return this.toMonthKey(d);
  }

  /**
   * Export page-view records for a given date range as CSV.
   * Returns the raw CSV string — the controller sets the response headers.
   */
  async exportCsv(from: Date, to: Date): Promise<string> {
    const records = await this.pageViewModel
      .find({
        createdAt: { $gte: from, $lte: to },
      })
      .select('path visitorId country city deviceType browser os trafficSource createdAt')
      .sort({ createdAt: -1 })
      .limit(50_000) // safety cap to prevent gigantic exports
      .lean()
      .exec();

    const header = 'date,path,visitorId,country,city,deviceType,browser,os,trafficSource';
    const rows = (records as Array<Record<string, unknown>>).map(r => [
      r['createdAt'] instanceof Date
        ? (r['createdAt'] as Date).toISOString()
        : String(r['createdAt'] ?? ''),
      this.csvCell(String(r['path'] ?? '')),
      this.csvCell(String(r['visitorId'] ?? '')),
      this.csvCell(String(r['country'] ?? '')),
      this.csvCell(String(r['city'] ?? '')),
      this.csvCell(String(r['deviceType'] ?? '')),
      this.csvCell(String(r['browser'] ?? '')),
      this.csvCell(String(r['os'] ?? '')),
      this.csvCell(String(r['trafficSource'] ?? '')),
    ].join(','));

    return [header, ...rows].join('\n');
  }

  /** Wrap a CSV field value in quotes and escape internal quotes. */
  private csvCell(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private async aggregateByField(
    field: string,
    limit: number,
    extraMatch: Record<string, unknown> = {},
  ): Promise<BreakdownItem[]> {
    const results = await this.pageViewModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...extraMatch, [field]: { $exists: true, $nin: ['', null] } } },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ])
      .exec();

    return results.map(r => ({ label: r._id ?? 'Unknown', count: r.count }));
  }

  private async countViewsByDay(days: number): Promise<ViewsByDayPoint[]> {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const results = await this.pageViewModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    const counts = new Map(results.map(item => [item._id, item.count]));

    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: counts.get(key) ?? 0 };
    });
  }

  private async aggregateTopLocations(
    limit: number,
    extraMatch: Record<string, unknown> = {},
  ): Promise<BreakdownItem[]> {
    const hasCity = { $and: [{ $ne: ['$city', ''] }, { $ne: ['$city', null] }] };
    const hasCountry = { $and: [{ $ne: ['$country', ''] }, { $ne: ['$country', null] }] };

    const results = await this.pageViewModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            ...extraMatch,
            $or: [
              { city: { $nin: ['', null] } },
              { country: { $nin: ['', null] } },
            ],
          },
        },
        {
          $project: {
            locationLabel: {
              $switch: {
                branches: [
                  {
                    case: { $and: [hasCity, hasCountry] },
                    then: { $concat: ['$city', ', ', '$country'] },
                  },
                  { case: hasCity, then: '$city' },
                  { case: hasCountry, then: '$country' },
                ],
                default: 'Unknown',
              },
            },
          },
        },
        { $group: { _id: '$locationLabel', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ])
      .exec();

    return results.map(r => ({ label: r._id ?? 'Unknown', count: r.count }));
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private extractRawIp(req?: Request): string {
    if (!req) return '';
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIps = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded ?? '')
      .split(',')
      .map(ip => this.normalizeIp(ip))
      .filter(Boolean);
    const socketIp = this.normalizeIp((req.socket?.remoteAddress) ?? (req as any).ip ?? req.ip ?? '');

    const publicForwardedIp = forwardedIps.find(ip => !this.isPrivateIp(ip));
    if (publicForwardedIp) return publicForwardedIp;
    if (forwardedIps.length > 0) return forwardedIps[0];
    if (socketIp) return socketIp;

    return '';
  }

  private anonymizeIp(ip: string): string {
    if (!ip) return '';
    const ipv4Match = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    if (ipv4Match) return ipv4Match[1] + '.0';
    if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::';
    return ip;
  }

  private resolveGeo(ip: string): { country: string; city: string; region: string } {
    let normalizedIp = this.normalizeIp(ip);

    // In development, use well-known public IPs so geoip-lite can resolve locations
    if ((!normalizedIp || this.isPrivateIp(normalizedIp)) && process.env.NODE_ENV !== 'production') {
      const devIps = ['151.38.39.1', '93.62.236.1', '2.39.170.1', '185.31.175.1', '8.8.8.8'];
      normalizedIp = devIps[Math.floor(Math.random() * devIps.length)];
    }

    if (!normalizedIp || this.isPrivateIp(normalizedIp)) {
      return { country: '', city: '', region: '' };
    }

    try {
      const geo = geoip.lookup(normalizedIp);
      const countryCode = geo?.country ?? '';
      let countryName = countryCode;
      try {
        const dn = new Intl.DisplayNames(['en'], { type: 'region' });
        countryName = dn.of(countryCode) ?? countryCode;
      } catch { /* fallback to code */ }

      return {
        country: countryName,
        city: geo?.city ?? '',
        region: geo?.region ?? '',
      };
    } catch {
      return { country: '', city: '', region: '' };
    }
  }

  private normalizeIp(ip: string): string {
    if (!ip) return '';

    let normalized = ip.trim();
    if (!normalized) return '';

    if (normalized.startsWith('::ffff:')) {
      normalized = normalized.slice(7);
    }

    if (normalized.startsWith('[') && normalized.includes(']')) {
      normalized = normalized.slice(1, normalized.indexOf(']'));
    }

    const ipv4WithPortMatch = normalized.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
    if (ipv4WithPortMatch) {
      normalized = ipv4WithPortMatch[1];
    }

    return normalized;
  }

  private isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    if (['::1', '127.0.0.1', 'localhost'].includes(ip)) return true;

    if (ip.includes(':')) {
      const lowerIp = ip.toLowerCase();
      return lowerIp.startsWith('fc') || lowerIp.startsWith('fd') || lowerIp.startsWith('fe80');
    }

    const octets = ip.split('.').map(part => Number(part));
    if (octets.length !== 4 || octets.some(Number.isNaN)) return false;

    const [first, second] = octets;
    if (first === 10 || first === 127) return true;
    if (first === 192 && second === 168) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;

    return false;
  }

  private parseUserAgent(ua: string): { deviceType: string; browser: string; os: string } {
    if (!ua) return { deviceType: 'Desktop', browser: 'Unknown', os: 'Unknown' };

    let deviceType = 'Desktop';
    if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) deviceType = 'Mobile';
    else if (/Tablet|iPad|Android(?!.*Mobile)/i.test(ua)) deviceType = 'Tablet';

    let browser = 'Other';
    if (/Edg\//i.test(ua))               browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua))    browser = 'Opera';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung';
    else if (/Chrome\/\d/i.test(ua))     browser = 'Chrome';
    else if (/Firefox\/\d/i.test(ua))    browser = 'Firefox';
    else if (/Safari\/\d/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/MSIE|Trident/i.test(ua))   browser = 'IE';

    let os = 'Other';
    if (/Windows NT/i.test(ua))             os = 'Windows';
    else if (/iPhone|iPad|iPod/i.test(ua))  os = 'iOS';
    else if (/Android/i.test(ua))           os = 'Android';
    else if (/Mac OS X/i.test(ua))          os = 'macOS';
    else if (/CrOS/i.test(ua))              os = 'ChromeOS';
    else if (/Linux/i.test(ua))             os = 'Linux';

    return { deviceType, browser, os };
  }

  /**
   * Priority: SPA-internal navigation > UTM parameters > referrer heuristics.
   * UTM wins over referrer because it states intent explicitly (e.g. a newsletter
   * link opened from Gmail would otherwise be classified as generic referral).
   */
  private resolveTrafficSource(navigationType: string, referrer: string, utmSource?: string): string {
    if (navigationType === 'internal') return 'internal';
    if (utmSource) {
      const s = utmSource.toLowerCase();
      const social = ['facebook', 'instagram', 'linkedin', 'twitter', 'x', 'tiktok', 'youtube', 'reddit', 'whatsapp', 'telegram'];
      const search = ['google', 'bing', 'yahoo', 'duckduckgo'];
      if (social.some(k => s.includes(k))) return 'social';
      if (search.some(k => s.includes(k))) return 'search';
      return 'campaign';
    }
    return this.detectTrafficSource(referrer);
  }

  private detectTrafficSource(referrer: string): string {
    if (!referrer) return 'direct';
    const r = referrer.toLowerCase();
    const internal = ['gentsallaku.it', 'localhost'];
    const search = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.', 'ecosia.', 'ask.com', 'startpage.'];
    const social = ['facebook.', 't.co/', 'twitter.', 'x.com', 'instagram.', 'linkedin.', 'youtube.', 'tiktok.', 'reddit.', 'pinterest.', 'whatsapp.', 'telegram.', 'discord.'];
    if (internal.some(s => r.includes(s))) return 'internal';
    if (search.some(s => r.includes(s))) return 'search';
    if (social.some(s => r.includes(s))) return 'social';
    return 'referral';
  }

  // ─── Click event tracking ────────────────────────────────────────────────

  async trackClickEvent(dto: TrackClickEventDto, req?: Request): Promise<{ success: boolean }> {
    const userAgent = (req?.headers['user-agent'] as string) ?? '';
    const { deviceType } = this.parseUserAgent(userAgent);

    await this.clickEventModel.create({
      visitorId: dto.visitorId,
      eventType: dto.eventType,
      label: dto.label,
      path: dto.path,
      destination: dto.destination ?? '',
      language: dto.language ?? '',
      deviceType,
    });

    this.cache.invalidatePrefix('analytics:clicks:');
    return { success: true };
  }

  async getClickStats(limit = 20): Promise<{
    topLabels: BreakdownItem[];
    topEventTypes: BreakdownItem[];
    topDestinations: BreakdownItem[];
    totalClicks: number;
  }> {
    return this.cache.getOrSet('analytics:clicks:stats', async () => {
      const [topLabels, topEventTypes, topDestinations, totalClicks] = await Promise.all([
        this.clickEventModel
          .aggregate([{ $group: { _id: '$label', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel
          .aggregate([{ $group: { _id: '$eventType', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel
          .aggregate([
            { $match: { destination: { $ne: '' } } },
            { $group: { _id: '$destination', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel.countDocuments().exec(),
      ]);

      return { topLabels, topEventTypes, topDestinations, totalClicks };
    }, 60_000);
  }
}
