import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PageView, PageViewDocument } from '../schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsDocument } from '../schemas/analytics-stats.schema';
import { MonthlyHistory, MonthlyHistoryDocument } from '../schemas/monthly-history.schema';
import { CacheService } from '../../common/services/cache.service';
import { csvCell, toMonthKey, prevMonthKey } from '../../common/utils/analytics-geo.util';

/**
 * Export/history side of the former monolithic AnalyticsService: CSV export
 * and the monthly rollover (which bridges the live AnalyticsStats singleton
 * and the MonthlyHistory archive — kept together since resetMonthlyStats
 * touches both). Live tracking/aggregation live in the sibling
 * AnalyticsTrackingService/AnalyticsQueryService.
 */
@Injectable()
export class AnalyticsExportService {
  private readonly logger = new Logger(AnalyticsExportService.name);

  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
    @InjectModel(AnalyticsStats.name)
    private analyticsStatsModel: Model<AnalyticsStatsDocument>,
    @InjectModel(MonthlyHistory.name)
    private monthlyHistoryModel: Model<MonthlyHistoryDocument>,
    private readonly cache: CacheService,
  ) {}

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
      csvCell(String(r['path'] ?? '')),
      csvCell(String(r['visitorId'] ?? '')),
      csvCell(String(r['country'] ?? '')),
      csvCell(String(r['city'] ?? '')),
      csvCell(String(r['deviceType'] ?? '')),
      csvCell(String(r['browser'] ?? '')),
      csvCell(String(r['os'] ?? '')),
      csvCell(String(r['trafficSource'] ?? '')),
    ].join(','));

    return [header, ...rows].join('\n');
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

  /**
   * Resets monthly stats. Saves a history snapshot first.
   * Guarded by `lastResetAt` to prevent duplicate resets within the same month.
   */
  async resetMonthlyStats(force = false): Promise<{ success: boolean; message: string }> {
    const now = new Date();
    const currentMonth = toMonthKey(now);
    const prevMonth = prevMonthKey(now);

    const current = await this.analyticsStatsModel.findOne().exec();

    // Deduplication: skip if already reset in the current calendar month
    if (!force && current?.lastResetAt) {
      const lastResetMonth = toMonthKey(current.lastResetAt);
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
}
