import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import type Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Finestra fissa atomica: INCR + PEXPIRE al primo hit, blocco separato per
 * blockDuration quando si supera il limite. Un solo round-trip, nessuna race
 * fra istanze.
 */
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return { hits, redis.call('PTTL', KEYS[1]), 1, blockTtl }
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return { hits, ttl, 1, tonumber(ARGV[3]) }
end
return { hits, ttl, 0, 0 }
`;

/**
 * Storage del ThrottlerGuard su Redis (attivo solo con REDIS_URL).
 *
 * In memoria ogni istanza conta per conto suo e il conteggio si azzera a
 * ogni redeploy: con più container (migrazione Plesk/Docker) il limite
 * effettivo per IP si moltiplicava. Se Redis non risponde si ripiega sullo
 * storage in memoria invece di bloccare tutte le richieste o di disattivare
 * del tutto il rate limit.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();

  constructor(private readonly redis: Pick<Redis, 'eval'>, private readonly prefix = 'throttle') {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${this.prefix}:${throttlerName}:${key}`;
    try {
      const [hits, ttlMs, blocked, blockMs] = (await this.redis.eval(
        INCREMENT_SCRIPT, 2, hitsKey, `${hitsKey}:block`, ttl, limit, blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (err) {
      this.logger.warn(`Redis throttler unavailable, using in-memory fallback: ${(err as Error).message}`);
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
