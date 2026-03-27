import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { CacheService } from '../common/services/cache.service';

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

const EMPTY_SUMMARY: SearchConsoleSummary = {
  configured: false,
  clicks: 0,
  impressions: 0,
  avgCtr: 0,
  avgPosition: 0,
  topQueries: [],
};

@Injectable()
export class SearchConsoleService {
  private readonly logger = new Logger(SearchConsoleService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async getSummary(): Promise<SearchConsoleSummary> {
    const clientEmail = this.config.get<string>('GSC_CLIENT_EMAIL');
    const privateKey  = this.config.get<string>('GSC_PRIVATE_KEY');
    const siteUrl     = this.config.get<string>('GSC_SITE_URL');

    if (!clientEmail || !privateKey || !siteUrl) {
      return EMPTY_SUMMARY;
    }

    return this.cache.getOrSet(
      'gsc:summary',
      () => this.fetchFromApi(clientEmail, privateKey, siteUrl),
      3_600_000, // cache 1 ora — GSC aggiorna ogni 24 h
    );
  }

  private async fetchFromApi(
    clientEmail: string,
    privateKey: string,
    siteUrl: string,
  ): Promise<SearchConsoleSummary> {
    try {
      const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const sc = google.searchconsole({ version: 'v1', auth });

      const endDate   = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 28);

      const res = await sc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: startDate.toISOString().slice(0, 10),
          endDate:   endDate.toISOString().slice(0, 10),
          dimensions: ['query'],
          rowLimit: 10,
          type: 'web',
        },
      });

      const rows = res.data.rows ?? [];

      const totalClicks      = rows.reduce((s, r) => s + (r.clicks       ?? 0), 0);
      const totalImpressions = rows.reduce((s, r) => s + (r.impressions  ?? 0), 0);
      const rawAvgPos        = rows.length
        ? rows.reduce((s, r) => s + (r.position ?? 0), 0) / rows.length
        : 0;
      const rawAvgCtr = totalImpressions ? totalClicks / totalImpressions : 0;

      return {
        configured:  true,
        clicks:      totalClicks,
        impressions: totalImpressions,
        avgCtr:      Math.round(rawAvgCtr * 10_000) / 100, // es. 3.45
        avgPosition: Math.round(rawAvgPos * 10)     / 10,  // es. 8.3
        topQueries:  rows.map(r => ({
          query:       (r.keys ?? [])[0] ?? '',
          clicks:      r.clicks       ?? 0,
          impressions: r.impressions  ?? 0,
          ctr:         Math.round((r.ctr      ?? 0) * 10_000) / 100,
          position:    Math.round((r.position ?? 0) * 10)     / 10,
        })),
      };
    } catch (err) {
      this.logger.warn(`Search Console API error: ${(err as Error).message}`);
      return { ...EMPTY_SUMMARY, configured: true };
    }
  }
}
