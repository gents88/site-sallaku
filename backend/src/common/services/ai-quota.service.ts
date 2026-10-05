import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CacheService } from './cache.service';

// 25h rather than a strict 24h: absorbs clock/deploy skew around the day
// boundary without letting a window run twice as long as intended.
const DAY_TTL_MS = 25 * 60 * 60 * 1000;

/**
 * Daily spend guard for AI-backed endpoints (/ai/*, chatbot). These accept
 * anonymous requests, so @Throttle's per-minute limit alone doesn't stop
 * sustained abuse — IP rotation, or just a slow drip spread across a day.
 * This adds two backstops: a per-IP daily request cap, and a global daily
 * token budget that acts as a kill switch for the whole surface once
 * tripped, regardless of how many distinct IPs are involved.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  hashIp(ip: string): string {
    return ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : 'unknown';
  }

  /**
   * Call before doing any AI work for a request. Throws 503 if the global
   * daily token budget is exhausted (kill switch), or 429 if this IP has
   * already used its daily request allowance.
   */
  async assertWithinBudget(ip: string): Promise<void> {
    const tokenBudget = this.config.get<number>('AI_DAILY_TOKEN_BUDGET', 300_000);
    const tokensToday = await this.cache.getCounter(`ai-quota:tokens:${this.today()}`);
    if (tokensToday >= tokenBudget) {
      this.logger.warn(`AI daily token budget exhausted (${tokensToday}/${tokenBudget})`);
      throw new HttpException(
        'Servizio AI temporaneamente non disponibile per oggi. Riprova domani.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const perIpCap = this.config.get<number>('AI_MAX_CALLS_PER_IP_PER_DAY', 30);
    const ipHash = this.hashIp(ip);
    const callsToday = await this.cache.increment(`ai-quota:calls:${ipHash}:${this.today()}`, 1, DAY_TTL_MS);
    if (callsToday > perIpCap) {
      throw new HttpException(
        'Hai raggiunto il limite giornaliero di richieste AI. Riprova domani.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Called after an AI provider call completes, with the prompt+completion tokens it actually used. */
  async recordTokens(count: number): Promise<void> {
    if (count > 0) {
      await this.cache.increment(`ai-quota:tokens:${this.today()}`, count, DAY_TTL_MS);
    }
  }
}
