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
  ToolConversionRow,
  AcquisitionReport,
  LeadAttributionReport,
  LeadArticleRow,
  EntryPageRow,
  RecentVisit,
} from '../analytics.types';

/** Domini del sito stesso: come referrer non sono una provenienza esterna. */
const OWN_HOSTS = ['gentsallaku.it', 'www.gentsallaku.it', 'localhost'];

/** Pagina di un articolo: /blog/<slug> con o senza prefisso lingua. */
const BLOG_POST_PATH = /^(?:\/(?:en|sq|es|pt|fr|de))?\/blog\/[^/]+$/;

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

  /**
   * Per-tool funnel: quanti visitatori unici hanno usato un tool /lab (eventType
   * 'lab_tool') e quanti di quegli stessi visitorId compaiono anche come lead
   * (eventType 'lead' — form contatti o richiesta di chat live) nella stessa
   * finestra di `days` giorni. Attribuzione approssimata per finestra temporale,
   * non per ordine cronologico esatto uso→lead — sufficiente per una metrica di
   * business, non un motore di attribuzione legale-grade.
   */
  async getToolConversionFunnel(days = 30): Promise<ToolConversionRow[]> {
    const since = new Date(Date.now() - days * 86_400_000);

    const [leadVisitorIds, toolUsage] = await Promise.all([
      this.clickEventModel.distinct('visitorId', { eventType: 'lead', createdAt: { $gte: since } }).exec(),
      this.clickEventModel
        .aggregate<{ _id: string; visitorIds: string[] }>([
          { $match: { eventType: 'lab_tool', createdAt: { $gte: since } } },
          { $group: { _id: { tool: '$label', visitorId: '$visitorId' } } },
          { $group: { _id: '$_id.tool', visitorIds: { $push: '$_id.visitorId' } } },
        ])
        .exec(),
    ]);

    const leadSet = new Set<string>(leadVisitorIds as unknown as string[]);

    return toolUsage
      .map((row) => {
        const uniqueVisitors = row.visitorIds.length;
        const becameLead = row.visitorIds.filter((id) => leadSet.has(id)).length;
        return {
          tool: row._id,
          uniqueVisitors,
          becameLead,
          conversionRate: uniqueVisitors > 0 ? Math.round((becameLead / uniqueVisitors) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors);
  }

  /**
   * Da dove arrivano i visitatori e su quale pagina entrano, negli ultimi `days`
   * giorni: sorgenti, siti di provenienza (per host), pagine d'ingresso divise per
   * sorgente e le ultime visite. Conta solo gli arrivi (navigationType 'entry'):
   * la navigazione interna non dice nulla sulla provenienza.
   */
  async getAcquisition(days = 30): Promise<AcquisitionReport> {
    return this.cache.getOrSet(`analytics:acquisition:${days}`, async () => {
      const start = new Date(Date.now() - days * 86_400_000);
      const entryMatch = { createdAt: { $gte: start }, navigationType: { $ne: 'internal' } };
      const normalizedPath = { $arrayElemAt: [{ $split: ['$path', '?'] }, 0] };

      const previousMatch = { createdAt: { $gte: new Date(start.getTime() - days * 86_400_000), $lt: start }, navigationType: { $ne: 'internal' } };
      const [totalEntries, previousTotalEntries, sources, referrerRows, entryRows, recent] = await Promise.all([
        this.pageViewModel.countDocuments(entryMatch).exec(),
        this.pageViewModel.countDocuments(previousMatch).exec(),
        this.aggregateByField('trafficSource', 8, entryMatch),
        this.pageViewModel
          .aggregate<{ _id: string; count: number }>([
            { $match: { ...entryMatch, referrer: { $nin: ['', null] } } },
            { $group: { _id: '$referrer', count: { $sum: 1 } } },
          ])
          .exec(),
        this.pageViewModel
          .aggregate<{ _id: string; entries: number; sources: Array<{ k: string; v: number }> }>([
            { $match: entryMatch },
            { $group: { _id: { path: normalizedPath, source: '$trafficSource' }, count: { $sum: 1 } } },
            {
              $group: {
                _id: '$_id.path',
                entries: { $sum: '$count' },
                sources: { $push: { k: { $ifNull: ['$_id.source', 'direct'] }, v: '$count' } },
              },
            },
            { $sort: { entries: -1 } },
            { $limit: 20 },
          ])
          .exec(),
        this.pageViewModel
          .find(entryMatch)
          .sort({ createdAt: -1 })
          .limit(40)
          .select('createdAt trafficSource referrer utmSource path country city deviceType sessionId durationMs')
          .lean<Array<PageView & { createdAt: Date }>>()
          .exec(),
      ]);

      // Pagine viste e tempo totale per le sessioni delle ultime visite (una sola query).
      const sessionIds = [...new Set(recent.map(v => v.sessionId).filter(Boolean))];
      const sessionRows = sessionIds.length
        ? await this.pageViewModel
            .aggregate<{ _id: string; pages: number; durationMs: number }>([
              { $match: { sessionId: { $in: sessionIds } } },
              { $group: { _id: '$sessionId', pages: { $sum: 1 }, durationMs: { $sum: '$durationMs' } } },
            ])
            .exec()
        : [];
      const bySession = new Map(sessionRows.map(r => [r._id, r]));

      const entryPages: EntryPageRow[] = entryRows.map(r => ({
        path: r._id || '/',
        entries: r.entries,
        sources: Object.fromEntries(r.sources.map(x => [x.k, x.v])),
      }));

      const recentVisits: RecentVisit[] = recent.map(v => {
        const session = v.sessionId ? bySession.get(v.sessionId) : undefined;
        const durationMs = session ? session.durationMs : v.durationMs;
        return {
          at: new Date(v.createdAt).toISOString(),
          trafficSource: v.trafficSource || 'direct',
          referrerHost: this.referrerHost(v.referrer),
          utmSource: v.utmSource || '',
          entryPath: (v.path || '/').split('?')[0],
          country: v.country || '',
          city: v.city || '',
          deviceType: v.deviceType || '',
          pages: session ? session.pages : 1,
          durationSec: durationMs > 0 ? Math.round(durationMs / 1000) : null,
        };
      });

      return {
        days,
        totalEntries,
        previousTotalEntries,
        sources,
        referrers: this.mergeReferrersByHost(referrerRows, 15),
        entryPages,
        recentVisits,
      };
    });
  }

  /**
   * Da dove arrivano i contatti. Per ogni lead (eventType 'lead': form contatti
   * o richiesta di chat live) prende l'ultimo arrivo dall'esterno dello stesso
   * visitatore prima del contatto (attribuzione last-touch) e gli articoli del
   * blog che aveva letto prima di scrivere. Un visitatore con più lead conta una
   * volta per ogni lead nelle sorgenti, una volta sola negli articoli.
   */
  async getLeadAttribution(days = 30): Promise<LeadAttributionReport> {
    return this.cache.getOrSet(`analytics:lead-attribution:${days}`, async () => {
      const now = Date.now();
      const since = new Date(now - days * 86_400_000);
      const previousSince = new Date(now - 2 * days * 86_400_000);

      const [leads, previousTotalLeads] = await Promise.all([
        this.clickEventModel
          .find({ eventType: 'lead', createdAt: { $gte: since } })
          .select('visitorId label createdAt')
          .lean<Array<{ visitorId: string; label: string; createdAt: Date }>>()
          .exec(),
        this.clickEventModel.countDocuments({ eventType: 'lead', createdAt: { $gte: previousSince, $lt: since } }).exec(),
      ]);

      const empty: LeadAttributionReport = {
        days, totalLeads: 0, previousTotalLeads, byKind: [], bySource: [], byReferrer: [], byEntryPage: [], articles: [],
      };
      if (!leads.length) return empty;

      const visitorIds = [...new Set(leads.map(l => l.visitorId))];
      // Le visite fino a `days` giorni prima dell'inizio del periodo: un lead di
      // oggi può venire da un articolo letto la settimana scorsa.
      const views = await this.pageViewModel
        .find({ visitorId: { $in: visitorIds }, createdAt: { $gte: previousSince } })
        .select('visitorId path trafficSource referrer navigationType createdAt')
        .sort({ createdAt: 1 })
        .lean<Array<PageView & { createdAt: Date }>>()
        .exec();

      const viewsByVisitor = new Map<string, Array<PageView & { createdAt: Date }>>();
      for (const v of views) {
        const list = viewsByVisitor.get(v.visitorId) ?? [];
        list.push(v);
        viewsByVisitor.set(v.visitorId, list);
      }

      const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
      const kinds = new Map<string, number>();
      const sources = new Map<string, number>();
      const referrers = new Map<string, number>();
      const entryPages = new Map<string, number>();
      const articleLeads = new Map<string, Set<string>>();

      for (const lead of leads) {
        count(kinds, lead.label || 'other');
        const before = (viewsByVisitor.get(lead.visitorId) ?? []).filter(v => v.createdAt <= lead.createdAt);
        const lastEntry = [...before].reverse().find(v => v.navigationType !== 'internal');
        count(sources, lastEntry?.trafficSource || 'direct');
        const host = this.referrerHost(lastEntry?.referrer);
        if (host) count(referrers, host);
        if (lastEntry) count(entryPages, (lastEntry.path || '/').split('?')[0]);
        for (const v of before) {
          const path = (v.path || '').split('?')[0];
          if (!BLOG_POST_PATH.test(path)) continue;
          const set = articleLeads.get(path) ?? new Set<string>();
          set.add(lead.visitorId);
          articleLeads.set(path, set);
        }
      }

      // Visitatori unici di quegli articoli nel periodo, per il tasso di conversione.
      const articlePaths = [...articleLeads.keys()];
      const visitorRows = articlePaths.length
        ? await this.pageViewModel
            .aggregate<{ _id: string; visitors: number }>([
              { $match: { createdAt: { $gte: since } } },
              { $addFields: { normalizedPath: { $arrayElemAt: [{ $split: ['$path', '?'] }, 0] } } },
              { $match: { normalizedPath: { $in: articlePaths } } },
              { $group: { _id: { path: '$normalizedPath', visitorId: '$visitorId' } } },
              { $group: { _id: '$_id.path', visitors: { $sum: 1 } } },
            ])
            .exec()
        : [];
      const visitorsByPath = new Map(visitorRows.map(r => [r._id, r.visitors]));

      const articles: LeadArticleRow[] = articlePaths
        .map(path => {
          const leadsCount = articleLeads.get(path)!.size;
          // Almeno quanti lead: un lettore del periodo precedente non è nel conteggio dei visitatori.
          const visitors = Math.max(visitorsByPath.get(path) ?? 0, leadsCount);
          return { path, leads: leadsCount, visitors, rate: Math.round((leadsCount / visitors) * 1000) / 10 };
        })
        .sort((a, b) => b.leads - a.leads || b.rate - a.rate)
        .slice(0, 15);

      const toItems = (map: Map<string, number>, limit: number) =>
        [...map.entries()].map(([label, c]) => ({ label, count: c })).sort((a, b) => b.count - a.count).slice(0, limit);

      return {
        days,
        totalLeads: leads.length,
        previousTotalLeads,
        byKind: toItems(kinds, 5),
        bySource: toItems(sources, 8),
        byReferrer: toItems(referrers, 10),
        byEntryPage: toItems(entryPages, 10),
        articles,
      };
    });
  }

  /** Host esterno di un referrer ('' se vuoto o se è il sito stesso). */
  private referrerHost(referrer: string | undefined): string {
    if (!referrer) return '';
    let host = referrer;
    try {
      host = new URL(referrer).hostname.replace(/^www\./, '');
    } catch {
      /* referrer non URL: lo lascio così com'è */
    }
    return OWN_HOSTS.includes(host) ? '' : host;
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
    const byHost = new Map<string, number>();

    for (const row of rows) {
      let host = row._id;
      try {
        host = new URL(row._id).hostname.replace(/^www\./, '');
      } catch {
        /* keep raw value for non-URL referrers */
      }
      if (OWN_HOSTS.includes(host)) continue;
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
