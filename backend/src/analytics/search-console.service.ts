import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';

/**
 * Solo il client di Search Console, caricato alla prima richiesta: il pacchetto
 * `googleapis` completo (tutte le API Google) costava ~110 MB di RAM al backend
 * fin dall'avvio, su un server da 1,8 GB senza swap, per una card della dashboard
 * admin. Questo pesa ~20 MB e solo se GSC è configurato e qualcuno lo consulta.
 */
const loadSearchConsole = () => import('@googleapis/searchconsole');

interface GscQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Pagina del sito che riceve clic da Google (dimensione `page`). */
interface GscPage {
  page: string;
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
  topPages: GscPage[];
}

const EMPTY_SUMMARY: SearchConsoleSummary = {
  configured: false,
  clicks: 0,
  impressions: 0,
  avgCtr: 0,
  avgPosition: 0,
  topQueries: [],
  topPages: [],
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
      const { auth, searchconsole } = await loadSearchConsole();
      const jwt = new auth.JWT({
        email: clientEmail,
        key: privateKey.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const sc = searchconsole({ version: 'v1', auth: jwt });

      const endDate   = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 28);

      const range = {
        startDate: startDate.toISOString().slice(0, 10),
        endDate:   endDate.toISOString().slice(0, 10),
        type: 'web',
      };
      // Totali da una richiesta senza dimensioni: sommare le prime 10 query
      // sottostimava clic e impressioni (tutte le altre ricerche restavano fuori).
      const [totalsRes, queriesRes, pagesRes] = await Promise.all([
        sc.searchanalytics.query({ siteUrl, requestBody: { ...range } }),
        sc.searchanalytics.query({ siteUrl, requestBody: { ...range, dimensions: ['query'], rowLimit: 10 } }),
        sc.searchanalytics.query({ siteUrl, requestBody: { ...range, dimensions: ['page'], rowLimit: 10 } }),
      ]);

      const totals = (totalsRes.data.rows ?? [])[0] ?? {};
      const round = (r: { clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }) => ({
        clicks:      r.clicks       ?? 0,
        impressions: r.impressions  ?? 0,
        ctr:         Math.round((r.ctr      ?? 0) * 10_000) / 100, // es. 3.45 (%)
        position:    Math.round((r.position ?? 0) * 10)     / 10,  // es. 8.3
      });
      const total = round(totals);

      return {
        configured:  true,
        clicks:      total.clicks,
        impressions: total.impressions,
        avgCtr:      total.ctr,
        avgPosition: total.position,
        topQueries:  (queriesRes.data.rows ?? []).map(r => ({ query: (r.keys ?? [])[0] ?? '', ...round(r) })),
        topPages:    (pagesRes.data.rows ?? []).map(r => ({ page: (r.keys ?? [])[0] ?? '', ...round(r) })),
      };
    } catch (err) {
      this.logger.warn(`Search Console API error: ${(err as Error).message}`);
      return { ...EMPTY_SUMMARY, configured: true };
    }
  }
}
