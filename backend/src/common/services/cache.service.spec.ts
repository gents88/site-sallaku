import { CacheService } from './cache.service';

describe('CacheService (in-memory backend, no REDIS_URL)', () => {
  let cache: CacheService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    cache = new CacheService();
  });

  afterEach(async () => {
    await cache.onModuleDestroy();
  });

  describe('increment / getCounter', () => {
    it('crea il contatore a 0 e lo incrementa della quantità indicata', async () => {
      const first = await cache.increment('k', 5, 60_000);
      expect(first).toBe(5);

      const second = await cache.increment('k', 3, 60_000);
      expect(second).toBe(8);
    });

    it('getCounter restituisce 0 per una chiave mai scritta', async () => {
      expect(await cache.getCounter('never-written')).toBe(0);
    });

    it('getCounter riflette il valore accumulato senza incrementarlo', async () => {
      await cache.increment('k', 10, 60_000);
      expect(await cache.getCounter('k')).toBe(10);
      expect(await cache.getCounter('k')).toBe(10);
    });

    it('scaduto il ttl, il contatore riparte da zero', async () => {
      await cache.increment('k', 10, -1);
      const after = await cache.increment('k', 4, 60_000);
      expect(after).toBe(4);
    });

    it('tiene contatori separati per chiavi diverse', async () => {
      await cache.increment('a', 1, 60_000);
      await cache.increment('b', 1, 60_000);
      await cache.increment('a', 1, 60_000);

      expect(await cache.getCounter('a')).toBe(2);
      expect(await cache.getCounter('b')).toBe(1);
    });
  });
});
