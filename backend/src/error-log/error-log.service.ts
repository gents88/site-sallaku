import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { ServerError, ServerErrorDocument } from './server-error.schema';

export interface ErrorOccurrence {
  method: string;
  url: string;
  status: number;
  name?: string;
  message?: string;
  stack?: string;
  requestId?: string;
}

export interface ServerErrorView {
  _id: string;
  method: string;
  route: string;
  path: string;
  status: number;
  name: string;
  message: string;
  stack: string;
  count: number;
  today: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
}

export interface ServerErrorSummary {
  /** Gruppi non risolti */
  open: number;
  /** Occorrenze di oggi (UTC), di tutti i gruppi */
  today: number;
  /** Occorrenze degli ultimi 7 giorni */
  week: number;
  recent: ServerErrorView[];
}

/** Al massimo tante scritture per finestra: un loop di errori non deve martellare Mongo. */
const MAX_WRITES_PER_WINDOW = 30;
const WINDOW_MS = 10_000;

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/**
 * Id, slug numerici, UUID e token lunghi diventano segnaposti, così
 * /blog/posts/abc123 e /blog/posts/def456 finiscono nello stesso gruppo.
 */
export function normalizeRoute(url: string): string {
  const path = (url || '/').split('?')[0].split('#')[0];
  return (
    path
      .split('/')
      .map((seg) => {
        if (!seg) return seg;
        if (/^[0-9a-f]{24}$/i.test(seg)) return ':id';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':uuid';
        if (/^\d+$/.test(seg)) return ':n';
        if (seg.length > 40) return ':token';
        return seg;
      })
      .join('/')
      .slice(0, 200) || '/'
  );
}

/** I numeri nel messaggio (id, durate, porte) non devono creare gruppi diversi. */
export function errorFingerprint(o: Pick<ErrorOccurrence, 'method' | 'url' | 'status' | 'name' | 'message'>): string {
  const firstLine = (o.message ?? '').split('\n')[0].replace(/\d+/g, '#').slice(0, 200);
  return createHash('sha1')
    .update([o.method.toUpperCase(), normalizeRoute(o.url), o.status, o.name ?? 'Error', firstLine].join('|'))
    .digest('hex');
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDays(n: number, now: Date): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    return utcDay(d);
  });
}

@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);
  private windowStart = 0;
  private writesInWindow = 0;
  private dropped = 0;

  constructor(@InjectModel(ServerError.name) private readonly model: Model<ServerErrorDocument>) {}

  /** Mai lancia: il registro degli errori non deve generare altri errori. */
  async record(o: ErrorOccurrence, now = new Date()): Promise<void> {
    if (!this.takeWriteSlot(now.getTime())) return;
    const fingerprint = errorFingerprint(o);
    try {
      await this.model
        .updateOne(
          { fingerprint },
          {
            $inc: { count: 1, [`days.${utcDay(now)}`]: 1 },
            $set: {
              lastSeenAt: now,
              path: (o.url || '').split('?')[0].slice(0, 300),
              message: (o.message ?? '').slice(0, MAX_MESSAGE),
              stack: (o.stack ?? '').slice(0, MAX_STACK),
              lastRequestId: o.requestId ?? '',
              resolvedAt: null,
            },
            $setOnInsert: {
              method: o.method.toUpperCase(),
              route: normalizeRoute(o.url),
              status: o.status,
              name: o.name ?? 'Error',
              firstSeenAt: now,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (err) {
      this.logger.warn(`Registrazione errore fallita: ${(err as Error).message}`);
    }
  }

  async summary(now = new Date(), limit = 10): Promise<ServerErrorSummary> {
    const week = lastDays(7, now);
    const today = week[0];
    const since = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const [open, docs] = await Promise.all([
      this.model.countDocuments({ resolvedAt: null }).exec(),
      this.model.find({ lastSeenAt: { $gte: since } }).sort({ lastSeenAt: -1 }).limit(200).lean().exec(),
    ]);

    let todayCount = 0;
    let weekCount = 0;
    for (const d of docs) {
      todayCount += Number(d.days?.[today]) || 0;
      for (const day of week) weekCount += Number(d.days?.[day]) || 0;
    }

    return {
      open,
      today: todayCount,
      week: weekCount,
      recent: docs
        .filter((d) => !d.resolvedAt)
        .slice(0, limit)
        .map((d) => this.toView(d as unknown as ServerErrorDocument & { _id: unknown }, today)),
    };
  }

  async list(includeResolved = false, limit = 50, now = new Date()): Promise<ServerErrorView[]> {
    const docs = await this.model
      .find(includeResolved ? {} : { resolvedAt: null })
      .sort({ lastSeenAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean()
      .exec();
    const today = utcDay(now);
    return docs.map((d) => this.toView(d as unknown as ServerErrorDocument & { _id: unknown }, today));
  }

  async resolve(id: string, now = new Date()): Promise<{ success: boolean }> {
    const res = await this.model.updateOne({ _id: id }, { $set: { resolvedAt: now } }).exec();
    if (!res.matchedCount) throw new NotFoundException('Error group not found');
    return { success: true };
  }

  async resolveAll(now = new Date()): Promise<{ resolved: number }> {
    const res = await this.model.updateMany({ resolvedAt: null }, { $set: { resolvedAt: now } }).exec();
    return { resolved: res.modifiedCount };
  }

  private toView(d: ServerErrorDocument & { _id: unknown }, today: string): ServerErrorView {
    return {
      _id: String(d._id),
      method: d.method,
      route: d.route,
      path: d.path,
      status: d.status,
      name: d.name,
      message: d.message,
      stack: d.stack,
      count: d.count,
      today: Number(d.days?.[today]) || 0,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      resolvedAt: d.resolvedAt ?? null,
    };
  }

  private takeWriteSlot(now: number): boolean {
    if (now - this.windowStart >= WINDOW_MS) {
      if (this.dropped > 0) this.logger.warn(`Registro errori: ${this.dropped} occorrenze non salvate (troppe in 10 s)`);
      this.windowStart = now;
      this.writesInWindow = 0;
      this.dropped = 0;
    }
    if (this.writesInWindow >= MAX_WRITES_PER_WINDOW) {
      this.dropped++;
      return false;
    }
    this.writesInWindow++;
    return true;
  }
}
