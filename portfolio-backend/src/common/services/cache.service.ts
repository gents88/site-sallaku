import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-process TTL cache.
 * Avoids the Redis dependency for lightweight, single-instance deployments
 * while still preventing repeated expensive DB aggregations within short windows.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /** Return cached value if still valid, otherwise call `factory`, store & return the result. */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (entry && Date.now() < entry.expiresAt) {
      return entry.value;
    }

    const value = await factory();
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  /** Explicitly remove a cached entry (e.g. after a write operation). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries whose key starts with `prefix`. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        this.logger.debug(`Cache invalidated: ${key}`);
      }
    }
  }
}
