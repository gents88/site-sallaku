import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PageView, PageViewDocument } from '../schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsDocument } from '../schemas/analytics-stats.schema';
import { ClickEvent, ClickEventDocument } from '../schemas/click-event.schema';
import { CacheService } from '../../common/services/cache.service';
import {
  BreakdownItem,
  VisitSummary,
  AnalyticsStatsResponse,
  AdvancedAnalytics,
  DailyEngagementReport,
  PageEngagement,
} from '../analytics.types';

/**
 * Read/aggregation side of the former monolithic AnalyticsService. Tracking
 * (writes) lives in AnalyticsTrackingService, export/history in
 * AnalyticsExportService — see those files for the split rationale.
 */
@Injectable()
export class AnalyticsQueryService {
  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
    @InjectModel(AnalyticsStats.name)
    private analyticsStatsModel: Model<AnalyticsStatsDocument>,
    @InjectModel(ClickEvent.name)
    private clickEventModel: Model<ClickEventDocument>,
    private readonly cache: CacheService,
  ) {}

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

  async getTopPages(limit = 10): Promise<BreakdownItem[]> {
    return this.cache.getOrSet(`analytics:top-pages:${limit}`, () =>
      this.aggregateByField('path', limit), 60_000);
  }

  /**
   * `eventType` restringe l'aggregazione a una sola famiglia di eventi. Serve
   * perché `topLabels` è troncata a `limit` sull'intero dataset: senza filtro,
   * i click di una singola superficie (es. la sidebar) vengono schiacciati
   * fuori classifica dai CTA storici e il funnel diventa illeggibile.
   */
  async getClickStats(limit = 20, eventType?: string): Promise<{
    topLabels: BreakdownItem[];
    topEventTypes: BreakdownItem[];
    topDestinations: BreakdownItem[];
    totalClicks: number;
  }> {
    // eventType fa parte della chiave: due filtri diversi non devono condividere cache.
    const cacheKey = `analytics:clicks:stats:${limit}:${eventType ?? 'all'}`;
    // $match vuoto = nessun filtro, così la pipeline resta una sola forma.
    const scope: Record<string, unknown> = eventType ? { eventType } : {};

    return this.cache.getOrSet(cacheKey, async () => {
      const [topLabels, topEventTypes, topDestinations, totalClicks] = await Promise.all([
        this.clickEventModel
          .aggregate([{ $match: scope }, { $group: { _id: '$label', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: limit }])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel
          .aggregate([{ $match: scope }, { $group: { _id: '$eventType', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel
          .aggregate([
            { $match: { ...scope, destination: { $ne: '' } } },
            { $group: { _id: '$destination', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: limit },
          ])
          .exec()
          .then(r => r.map(i => ({ label: i._id as string, count: i.count as number }))),
        this.clickEventModel.countDocuments(scope).exec(),
      ]);

      return { topLabels, topEventTypes, topDestinations, totalClicks };
    }, 60_000);
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
        // Strip any leftover query string (utm_*, fbclid, …) so tracking-param
        // variants of the same page collapse into one row instead of one each
        { $addFields: { normalizedPath: { $arrayElemAt: [{ $split: ['$path', '?'] }, 0] } } },
        // First pass: one row per (path, visitor) so repeat visits are countable
        {
          $group: {
            _id: { path: '$normalizedPath', visitorId: '$visitorId' },
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

  private recordToSortedArray(record: Record<string, number> | undefined): Array<{ label: string; count: number }> {
    if (!record) return [];
    return Object.entries(record)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
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

  private async countViewsByDay(days: number) {
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
}
