import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import * as geoip from 'geoip-lite';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { PageView, PageViewDocument } from './schemas/page-view.schema';

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
  ) {}

  async trackPageView(dto: TrackPageViewDto, req?: Request): Promise<{ success: boolean }> {
    const rawIp = this.extractRawIp(req);
    const anonymizedIp = this.anonymizeIp(rawIp);
    const userAgent = (req?.headers['user-agent'] as string) ?? dto.userAgent ?? '';
    const { country, city } = this.resolveGeo(rawIp);
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
      deviceType,
      browser,
      os,
      trafficSource,
    });

    return { success: true };
  }

  async getVisitSummary(days = 7): Promise<VisitSummary> {
    const [totalViews, uniqueVisitors, viewsByDay] = await Promise.all([
      this.pageViewModel.countDocuments().exec(),
      this.pageViewModel.distinct('visitorId').then(ids => ids.length),
      this.countViewsByDay(days),
    ]);
    return { totalViews, uniqueVisitors, viewsByDay };
  }

  async getAdvancedAnalytics(): Promise<AdvancedAnalytics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayCount, topCountries, deviceBreakdown, browserBreakdown, osBreakdown, trafficSources] =
      await Promise.all([
        this.pageViewModel.countDocuments({ createdAt: { $gte: today } }).exec(),
        this.aggregateByField('country', 10),
        this.aggregateByField('deviceType', 5),
        this.aggregateByField('browser', 8),
        this.aggregateByField('os', 6),
        this.aggregateByField('trafficSource', 4),
      ]);

    return { todayCount, topCountries, deviceBreakdown, browserBreakdown, osBreakdown, trafficSources };
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

  // ─── Private helpers ────────────────────────────────────────────────────────

  private extractRawIp(req?: Request): string {
    if (!req) return '';
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded as string).split(',')[0];
      return ip.trim();
    }
    return (req.socket?.remoteAddress) ?? (req as any).ip ?? '';
  }

  private anonymizeIp(ip: string): string {
    if (!ip) return '';
    const ipv4Match = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
    if (ipv4Match) return ipv4Match[1] + '.0';
    if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::';
    return ip;
  }

  private resolveGeo(ip: string): { country: string; city: string } {
    const isPrivate = !ip
      || ['::1', '127.0.0.1', 'localhost', '::ffff:127.0.0.1'].includes(ip)
      || ip.startsWith('192.168.')
      || ip.startsWith('10.')
      || ip.startsWith('172.');
    if (isPrivate) return { country: '', city: '' };
    try {
      const geo = geoip.lookup(ip);
      return { country: geo?.country ?? '', city: geo?.city ?? '' };
    } catch {
      return { country: '', city: '' };
    }
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
