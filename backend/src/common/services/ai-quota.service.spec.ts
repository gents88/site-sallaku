import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiQuotaService } from './ai-quota.service';
import { CacheService } from './cache.service';

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
});
