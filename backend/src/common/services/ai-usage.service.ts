import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiUsageDay, AiUsageDayDocument } from './ai-usage.schema';

export type AiTokenSource = 'tools' | 'chatbot';

export const MAX_CAPPED_IPS = 200;

export interface AiUsageDayPoint {
  date: string;
  tokens: number;
  calls: number;
}

export interface AiUsageSummary {
  date: string;
  tokens: number;
  calls: number;
  byEndpoint: Array<{ endpoint: string; calls: number }>;
  tokensBySource: Record<AiTokenSource, number>;
  rejectedIpCap: number;
  rejectedBudget: number;
  cappedIps: number;
  /** Ultimi N giorni, dal più vecchio a oggi, con gli zeri dove non c'è stato traffico. */
  history: AiUsageDayPoint[];
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Le chiavi di Mongo non possono contenere '.' né iniziare con '$'. */
function safeKey(key: string): string {
  return key.replace(/[.$]/g, '_').slice(0, 60) || 'unknown';
}

/**
 * Persistenza giornaliera del consumo AI. Scritture "fire and forget": se
 * Mongo è lento o giù non si blocca una richiesta AI per un contatore.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(@InjectModel(AiUsageDay.name) private readonly model: Model<AiUsageDayDocument>) {}

  async recordCall(endpoint: string, now = new Date()): Promise<void> {
    await this.inc(utcDay(now), { calls: 1, [`byEndpoint.${safeKey(endpoint)}`]: 1 });
  }

  async recordTokens(count: number, source: AiTokenSource, now = new Date()): Promise<void> {
    if (count <= 0) return;
    await this.inc(utcDay(now), { tokens: count, [`tokensBySource.${source}`]: count });
  }

  async recordRejected(reason: 'ipCap' | 'budget', ipHash?: string, now = new Date()): Promise<void> {
    const date = utcDay(now);
    await this.inc(date, reason === 'ipCap' ? { rejectedIpCap: 1 } : { rejectedBudget: 1 });
    if (reason === 'ipCap' && ipHash) {
      // Il documento esiste già (creato dall'$inc sopra): niente upsert, e il
      // filtro sull'indice MAX_CAPPED_IPS-1 tiene l'elenco limitato.
      await this.model
        .updateOne({ date, [`cappedIps.${MAX_CAPPED_IPS - 1}`]: { $exists: false } }, { $addToSet: { cappedIps: ipHash } })
        .exec()
        .catch((err) => this.logger.warn(`cappedIps update failed: ${(err as Error).message}`));
    }
  }

  /** Token consumati oggi secondo il DB (null se il DB non risponde). */
  async tokensToday(now = new Date()): Promise<number | null> {
    try {
      const doc = await this.model.findOne({ date: utcDay(now) }, { tokens: 1 }).lean().exec();
      return doc?.tokens ?? 0;
    } catch {
      return null;
    }
  }

  async getSummary(days = 7, now = new Date()): Promise<AiUsageSummary> {
    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      return utcDay(d);
    });
    const docs = await this.model.find({ date: { $in: dates } }).lean().exec();
    const byDate = new Map(docs.map((d) => [d.date, d]));
    const today = byDate.get(dates[dates.length - 1]);

    return {
      date: dates[dates.length - 1],
      tokens: today?.tokens ?? 0,
      calls: today?.calls ?? 0,
      byEndpoint: Object.entries(today?.byEndpoint ?? {})
        .map(([endpoint, calls]) => ({ endpoint, calls: Number(calls) || 0 }))
        .sort((a, b) => b.calls - a.calls),
      tokensBySource: {
        tools: Number(today?.tokensBySource?.tools) || 0,
        chatbot: Number(today?.tokensBySource?.chatbot) || 0,
      },
      rejectedIpCap: today?.rejectedIpCap ?? 0,
      rejectedBudget: today?.rejectedBudget ?? 0,
      cappedIps: today?.cappedIps?.length ?? 0,
      history: dates.map((date) => ({
        date,
        tokens: byDate.get(date)?.tokens ?? 0,
        calls: byDate.get(date)?.calls ?? 0,
      })),
    };
  }

  private async inc(date: string, fields: Record<string, number>): Promise<void> {
    try {
      await this.model.updateOne({ date }, { $inc: fields }, { upsert: true }).exec();
    } catch (err) {
      this.logger.warn(`AI usage write failed: ${(err as Error).message}`);
    }
  }
}
