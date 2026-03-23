import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import * as geoip from 'geoip-lite';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { PageView, PageViewDocument } from './schemas/page-view.schema';
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
  constructor(
    @InjectModel(PageView.name)
    private pageViewModel: Model<PageViewDocument>,
    private readonly cache: CacheService,
  ) {}

  async trackPageView(dto: TrackPageViewDto, req?: Request): Promise<{ success: boolean }> {
    const rawIp = this.extractRawIp(req);
    const anonymizedIp = this.anonymizeIp(rawIp);
    const userAgent = (req?.headers['user-agent'] as string) ?? dto.userAgent ?? '';
    const { country, city, region } = this.resolveGeo(rawIp);
    const { deviceType, browser, os } = this.parseUserAgent(userAgent);
    const trafficSource = this.detectTrafficSource(dto.referrer ?? '');

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
    });

    // Bust summary caches so the next dashboard load sees fresh counts
    this.cache.invalidatePrefix('analytics:');
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

  private async aggregateByField(field: string, limit: number): Promise<BreakdownItem[]> {
    const results = await this.pageViewModel
      .aggregate<{ _id: string; count: number }>([
        { $match: { [field]: { $exists: true, $nin: ['', null] } } },
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

  private async aggregateTopLocations(limit: number): Promise<BreakdownItem[]> {
    const hasCity = { $and: [{ $ne: ['$city', ''] }, { $ne: ['$city', null] }] };
    const hasCountry = { $and: [{ $ne: ['$country', ''] }, { $ne: ['$country', null] }] };

    const results = await this.pageViewModel
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
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

  private detectTrafficSource(referrer: string): string {
    if (!referrer) return 'direct';
    const r = referrer.toLowerCase();
    const search = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.', 'ecosia.', 'ask.com', 'startpage.'];
    const social = ['facebook.', 't.co/', 'twitter.', 'x.com', 'instagram.', 'linkedin.', 'youtube.', 'tiktok.', 'reddit.', 'pinterest.', 'whatsapp.', 'telegram.', 'discord.'];
    if (search.some(s => r.includes(s))) return 'search';
    if (social.some(s => r.includes(s))) return 'social';
    return 'referral';
  }
}
