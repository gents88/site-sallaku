import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';
import { SearchConsoleService } from './search-console.service';

const mockJWT = jest.fn();
const mockQuery = jest.fn();
const mockSearchconsole = jest.fn(() => ({ searchanalytics: { query: mockQuery } }));
jest.mock('@googleapis/searchconsole', () => ({ auth: { JWT: mockJWT }, searchconsole: mockSearchconsole }));

function service(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const cache = { getOrSet: (_key: string, fn: () => Promise<unknown>) => fn() } as unknown as CacheService;
  return new SearchConsoleService(config, cache);
}

const CONFIGURED = {
  GSC_CLIENT_EMAIL: 'sa@progetto.iam.gserviceaccount.com',
  GSC_PRIVATE_KEY: '-----BEGIN KEY-----\\nabc\\n-----END KEY-----',
  GSC_SITE_URL: 'sc-domain:gentsallaku.it',
};

describe('SearchConsoleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    // Mezzogiorno UTC: lontano da mezzanotte, così il cambio d'ora non sposta le date.
    jest.useFakeTimers({ now: new Date('2026-11-03T12:00:00Z') });
  });

  afterEach(() => jest.useRealTimers());

  it('senza credenziali restituisce il riepilogo vuoto e non carica il client Google', async () => {
    const summary = await service({}).getSummary();
    expect(summary).toEqual({ configured: false, clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0, topQueries: [], topPages: [] });
    expect(mockJWT).not.toHaveBeenCalled();
    expect(mockSearchconsole).not.toHaveBeenCalled();
  });

  it('con le credenziali chiede totali, query e pagine degli ultimi 28 giorni', async () => {
    mockQuery.mockImplementation(({ requestBody }: { requestBody: { dimensions?: string[] } }) => {
      const dim = requestBody.dimensions?.[0];
      if (!dim) return Promise.resolve({ data: { rows: [{ clicks: 25, impressions: 1200, ctr: 0.020833, position: 9.46 }] } });
      if (dim === 'query') {
        return Promise.resolve({
          data: {
            rows: [
              { keys: ['gent sallaku'], clicks: 8, impressions: 100, ctr: 0.08, position: 2.34 },
              { keys: ['angular developer'], clicks: 2, impressions: 300, ctr: 0.00667, position: 11.66 },
            ],
          },
        });
      }
      return Promise.resolve({
        data: { rows: [{ keys: ['https://gentsallaku.it/en/blog/rxjs'], clicks: 6, impressions: 90, ctr: 0.0667, position: 4.04 }] },
      });
    });

    const summary = await service(CONFIGURED).getSummary();

    // La chiave arriva dall'env con "\n" letterali: vanno trasformati in a capo veri.
    expect(mockJWT).toHaveBeenCalledWith({
      email: CONFIGURED.GSC_CLIENT_EMAIL,
      key: '-----BEGIN KEY-----\nabc\n-----END KEY-----',
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    expect(mockSearchconsole).toHaveBeenCalledWith({ version: 'v1', auth: expect.any(mockJWT) });
    const bodies = mockQuery.mock.calls.map(c => c[0].requestBody);
    expect(mockQuery.mock.calls.every(c => c[0].siteUrl === CONFIGURED.GSC_SITE_URL)).toBe(true);
    const range = { startDate: '2026-10-06', endDate: '2026-11-03', type: 'web' };
    expect(bodies).toEqual([
      range,
      { ...range, dimensions: ['query'], rowLimit: 10 },
      { ...range, dimensions: ['page'], rowLimit: 10 },
    ]);

    // I totali vengono dalla richiesta senza dimensioni, non dalla somma delle prime 10 query.
    expect(summary).toEqual({
      configured: true,
      clicks: 25,
      impressions: 1200,
      avgCtr: 2.08,
      avgPosition: 9.5,
      topQueries: [
        { query: 'gent sallaku', clicks: 8, impressions: 100, ctr: 8, position: 2.3 },
        { query: 'angular developer', clicks: 2, impressions: 300, ctr: 0.67, position: 11.7 },
      ],
      topPages: [
        { page: 'https://gentsallaku.it/en/blog/rxjs', clicks: 6, impressions: 90, ctr: 6.67, position: 4 },
      ],
    });
  });

  it('un errore dell\'API restituisce zeri ma segnala che GSC è configurato', async () => {
    mockQuery.mockRejectedValue(new Error('quota exceeded'));
    const summary = await service(CONFIGURED).getSummary();
    expect(summary).toEqual({ configured: true, clicks: 0, impressions: 0, avgCtr: 0, avgPosition: 0, topQueries: [], topPages: [] });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('quota exceeded'));
  });
});
