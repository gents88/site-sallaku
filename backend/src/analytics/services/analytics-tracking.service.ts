import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { TrackPageViewDto } from '../dto/track-page-view.dto';
import { TrackPageLeaveDto } from '../dto/track-page-leave.dto';
import { TrackClickEventDto } from '../dto/track-click-event.dto';
import { PageView, PageViewDocument } from '../schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsDocument } from '../schemas/analytics-stats.schema';
import { ClickEvent, ClickEventDocument } from '../schemas/click-event.schema';
import { CacheService } from '../../common/services/cache.service';
import {
  extractRawIp,
  anonymizeIp,
  resolveGeo,
  parseUserAgent,
  normalizePath,
  resolveTrafficSource,
  sanitizeKey,
} from '../../common/utils/analytics-geo.util';

/**
 * Write-side of the former monolithic AnalyticsService: everything that
 * persists a new event or mutates the pre-aggregated stats singleton.
 * Read/aggregation lives in AnalyticsQueryService, export/history in
 * AnalyticsExportService — split so each stays focused and testable.
 */
@Injectable()
export class AnalyticsTrackingService {
  private readonly logger = new Logger(AnalyticsTrackingService.name);

  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
    @InjectModel(AnalyticsStats.name)
    private analyticsStatsModel: Model<AnalyticsStatsDocument>,
    @InjectModel(ClickEvent.name)
    private clickEventModel: Model<ClickEventDocument>,
    private readonly cache: CacheService,
  ) {}

  async trackPageView(dto: TrackPageViewDto, req?: Request): Promise<{ success: boolean }> {
    const rawIp = extractRawIp(req);
    const anonymizedIp = anonymizeIp(rawIp);
    const userAgent = (req?.headers['user-agent'] as string) ?? dto.userAgent ?? '';
    const { country, city, region } = resolveGeo(rawIp);
    const { deviceType, browser, os } = parseUserAgent(userAgent);
    const navigationType = dto.navigationType === 'internal' ? 'internal' : 'entry';
    const trafficSource = resolveTrafficSource(navigationType, dto.referrer ?? '', dto.utmSource);

    await this.pageViewModel.create({
      visitorId: dto.visitorId,
      path: normalizePath(dto.path),
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

  async trackClickEvent(dto: TrackClickEventDto, req?: Request): Promise<{ success: boolean }> {
    const userAgent = (req?.headers['user-agent'] as string) ?? '';
    const { deviceType } = parseUserAgent(userAgent);

    await this.clickEventModel.create({
      visitorId: dto.visitorId,
      eventType: dto.eventType,
      label: dto.label,
      path: normalizePath(dto.path),
      destination: dto.destination ?? '',
      language: dto.language ?? '',
      deviceType,
    });

    this.cache.invalidatePrefix('analytics:clicks:');
    return { success: true };
  }

  private async incrementStats(country: string, deviceType: string): Promise<void> {
    // Country names from Intl.DisplayNames (e.g. "Italy", "United States") are valid
    // MongoDB field name components — only dots and $ signs need escaping.
    const countryKey = country ? sanitizeKey(country) : 'Unknown';
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
}
