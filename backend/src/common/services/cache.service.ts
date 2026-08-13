import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * TTL cache with a shared key namespace.
 *
 * Backed by Redis when REDIS_URL is set — survives redeploys and is shared
 * across instances. Falls back to an in-process Map otherwise, which is fine
 * for a single-instance deployment but loses its contents on every restart
 * and isn't shared if the app ever scales horizontally.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly redis: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      this.redis.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      this.redis.connect().catch((err) => this.logger.warn(`Redis connect failed: ${err.message}`));
      this.logger.log('Cache backend: Redis');
    } else {
      this.redis = null;
      this.logger.log('Cache backend: in-memory (set REDIS_URL to share cache across instances/restarts)');
    }
  }

  /** Return cached value if still valid, otherwise call `factory`, store & return the result. */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached !== null) {
          return JSON.parse(cached) as T;
        }
        const value = await factory();
        await this.redis.set(key, JSON.stringify(value), 'PX', ttlMs);
        return value;
      } catch (err) {
        this.logger.warn(`Redis getOrSet failed for "${key}", falling back to factory: ${(err as Error).message}`);
        return factory();
      }
    }

    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() < entry.expiresAt) {
      return entry.value;
    }

    const value = await factory();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Explicitly remove a cached entry (e.g. after a write operation). */
  async invalidate(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key).catch((err) => this.logger.warn(`Redis invalidate failed: ${err.message}`));
      return;
    }
    this.store.delete(key);
  }

  /** Remove all entries whose key starts with `prefix`. */
  async invalidatePrefix(prefix: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err) {
        this.logger.warn(`Redis invalidatePrefix failed: ${(err as Error).message}`);
      }
      return;
    }

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        this.logger.debug(`Cache invalidated: ${key}`);
      }
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
