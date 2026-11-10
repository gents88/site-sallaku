import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiQuotaService } from './ai-quota.service';
import { CacheService } from './cache.service';
import { AiUsageService } from './ai-usage.service';
import { FeatureUnavailableException } from '../settings/feature-flags';

describe('AiQuotaService', () => {
  let cache: jest.Mocked<Pick<CacheService, 'getCounter' | 'increment'>>;
  let config: { get: jest.Mock };
  let service: AiQuotaService;

  beforeEach(() => {
    cache = {
      getCounter: jest.fn().mockResolvedValue(0),
      increment: jest.fn().mockResolvedValue(1),
    };
    config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
    service = new AiQuotaService(cache as unknown as CacheService, config as unknown as ConfigService);
  });

  describe('assertWithinBudget', () => {
    it('non lancia quando sotto sia il budget globale sia il tetto per-IP', async () => {
      cache.getCounter.mockResolvedValue(100);
      cache.increment.mockResolvedValue(5);

      await expect(service.assertWithinBudget('1.2.3.4')).resolves.toBeUndefined();
    });

    it('lancia 503 quando il budget giornaliero di token è esaurito, prima di toccare il contatore per-IP', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) => (key === 'AI_DAILY_TOKEN_BUDGET' ? 300_000 : fallback));
      cache.getCounter.mockResolvedValue(300_000);

      await expect(service.assertWithinBudget('1.2.3.4')).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(cache.increment).not.toHaveBeenCalled();
    });

    it('lancia 429 quando l’IP ha superato il tetto giornaliero di richieste', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) => (key === 'AI_MAX_CALLS_PER_IP_PER_DAY' ? 30 : fallback));
      cache.increment.mockResolvedValue(31);

      await expect(service.assertWithinBudget('1.2.3.4')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });

    it('non lancia quando il conteggio per-IP è esattamente al tetto', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) => (key === 'AI_MAX_CALLS_PER_IP_PER_DAY' ? 30 : fallback));
      cache.increment.mockResolvedValue(30);

      await expect(service.assertWithinBudget('1.2.3.4')).resolves.toBeUndefined();
    });

    it('due IP diversi ricevono chiavi di contatore diverse', async () => {
      await service.assertWithinBudget('1.1.1.1');
      await service.assertWithinBudget('2.2.2.2');

      const [keyA] = cache.increment.mock.calls[0];
      const [keyB] = cache.increment.mock.calls[1];
      expect(keyA).not.toBe(keyB);
    });

    it('un IP mancante non fa lanciare hashIp', async () => {
      await expect(service.assertWithinBudget('')).resolves.toBeUndefined();
    });
  });

  describe('con lo storico su Mongo (AiUsageService)', () => {
    let usage: jest.Mocked<Pick<AiUsageService, 'tokensToday' | 'recordCall' | 'recordRejected' | 'recordTokens'>>;
    let withUsage: AiQuotaService;

    beforeEach(() => {
      usage = {
        tokensToday: jest.fn().mockResolvedValue(0),
        recordCall: jest.fn().mockResolvedValue(undefined),
        recordRejected: jest.fn().mockResolvedValue(undefined),
        recordTokens: jest.fn().mockResolvedValue(undefined),
      };
      withUsage = new AiQuotaService(cache as unknown as CacheService, config as unknown as ConfigService, usage as unknown as AiUsageService);
    });

    it('dopo un riavvio (cache vuota) il budget resta esaurito se lo dice il DB', async () => {
      cache.getCounter.mockResolvedValue(0);
      usage.tokensToday.mockResolvedValue(300_000);

      const err = await withUsage.assertWithinBudget('1.2.3.4', 'format-text').catch((e) => e);

      expect(err).toBeInstanceOf(FeatureUnavailableException);
      expect(usage.recordRejected).toHaveBeenCalledWith('budget');
      expect(usage.recordCall).not.toHaveBeenCalled();
    });

    it('se il DB non risponde (null) vale il contatore in memoria', async () => {
      cache.getCounter.mockResolvedValue(10);
      usage.tokensToday.mockResolvedValue(null);
      await expect(withUsage.assertWithinBudget('1.2.3.4')).resolves.toBeUndefined();
    });

    it('conta la chiamata accettata per strumento', async () => {
      await withUsage.assertWithinBudget('1.2.3.4', 'summarize-file');
      expect(usage.recordCall).toHaveBeenCalledWith('summarize-file');
    });

    it('conta il rifiuto per IP con il solo hash dell’indirizzo', async () => {
      cache.increment.mockResolvedValue(31);
      await expect(withUsage.assertWithinBudget('8.8.8.8')).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(usage.recordRejected).toHaveBeenCalledWith('ipCap', withUsage.hashIp('8.8.8.8'));
    });

    it('recordTokens salva anche la provenienza', async () => {
      await withUsage.recordTokens(90, 'chatbot');
      expect(usage.recordTokens).toHaveBeenCalledWith(90, 'chatbot');
    });

    it('getConfig espone budget e tetto per IP configurati', () => {
      config.get.mockImplementation((key: string, fallback: unknown) => (key === 'AI_DAILY_TOKEN_BUDGET' ? 1000 : fallback));
      expect(withUsage.getConfig()).toEqual({ dailyTokenBudget: 1000, maxCallsPerIpPerDay: 30 });
    });
  });

  describe('recordTokens', () => {
    it('incrementa il contatore giornaliero della quantità di token indicata', async () => {
      await service.recordTokens(150);
      expect(cache.increment).toHaveBeenCalledWith(expect.stringContaining('ai-quota:tokens:'), 150, expect.any(Number));
    });

    it('non chiama il cache backend per un conteggio a zero', async () => {
      await service.recordTokens(0);
      expect(cache.increment).not.toHaveBeenCalled();
    });
  });

  describe('hashIp', () => {
    it('è deterministico per lo stesso indirizzo', () => {
      expect(service.hashIp('8.8.8.8')).toBe(service.hashIp('8.8.8.8'));
    });

    it('produce hash diversi per indirizzi diversi', () => {
      expect(service.hashIp('8.8.8.8')).not.toBe(service.hashIp('1.1.1.1'));
    });

    it('non espone mai l’IP in chiaro nell’hash', () => {
      expect(service.hashIp('8.8.8.8')).not.toContain('8.8.8.8');
    });
  });

  describe('status', () => {
    const callsKey = (ip: string) => `ai-quota:calls:${service.hashIp(ip)}:${new Date().toISOString().slice(0, 10)}`;

    it('riporta le richieste rimaste senza incrementare nessun contatore', async () => {
      cache.getCounter.mockImplementation(async (key: string) => (key === callsKey('1.2.3.4') ? 4 : 0));

      const status = await service.status('1.2.3.4');

      expect(status).toMatchObject({ limit: 30, used: 4, remaining: 26, unavailable: false });
      expect(cache.increment).not.toHaveBeenCalled();
    });

    it('non va mai sotto zero quando un IP ha superato il tetto (le richieste rifiutate contano)', async () => {
      cache.getCounter.mockImplementation(async (key: string) => (key === callsKey('1.2.3.4') ? 45 : 0));

      expect(await service.status('1.2.3.4')).toMatchObject({ used: 30, remaining: 0 });
    });

    it('segnala unavailable quando il budget globale di token è esaurito', async () => {
      cache.getCounter.mockImplementation(async (key: string) => (key.startsWith('ai-quota:tokens:') ? 300_000 : 0));

      expect((await service.status('1.2.3.4')).unavailable).toBe(true);
    });

    it('dopo un riavvio (cache vuota) il budget esaurito resta visibile grazie al DB', async () => {
      const usage = { tokensToday: jest.fn().mockResolvedValue(300_000) };
      const withUsage = new AiQuotaService(cache as unknown as CacheService, config as unknown as ConfigService, usage as unknown as AiUsageService);

      expect((await withUsage.status('1.2.3.4')).unavailable).toBe(true);
    });

    it('resetsAt è la prossima mezzanotte UTC', async () => {
      const { resetsAt } = await service.status('1.2.3.4');
      const reset = new Date(resetsAt);

      expect(reset.getUTCHours()).toBe(0);
      expect(reset.getTime()).toBeGreaterThan(Date.now());
      expect(reset.getTime() - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    it('IP diversi leggono contatori diversi', async () => {
      await service.status('1.1.1.1');
      await service.status('2.2.2.2');
      const keys = cache.getCounter.mock.calls.map(([k]) => k).filter((k) => k.startsWith('ai-quota:calls:'));
      expect(new Set(keys).size).toBe(2);
    });
  });
});
