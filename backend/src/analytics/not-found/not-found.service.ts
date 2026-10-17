import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NOT_FOUND_KINDS, NotFoundHit, NotFoundHitDocument, NotFoundKind } from './not-found-hit.schema';

/** Oltre questo numero di percorsi diversi si aggiornano solo quelli già noti (anti-spam). */
export const MAX_DISTINCT_PATHS = 2000;

export interface NotFoundView {
  _id: string;
  path: string;
  kind: NotFoundKind;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastReferrer: string;
}

export interface NotFoundSummary {
  open: number;
  top: NotFoundView[];
}

/** Solo il percorso: niente query string (può contenere token o email), niente frammento. */
export function normalizeNotFoundPath(raw: string): string | null {
  const path = (raw || '').split(/[?#]/)[0].trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 300) return null;
  return path.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
}

/** Origine + percorso del referrer: la query string resta fuori. */
export function sanitizeReferrer(raw?: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `${u.origin}${u.pathname}`.slice(0, 300);
  } catch {
    return '';
  }
}

@Injectable()
export class NotFoundService {
  private readonly logger = new Logger(NotFoundService.name);

  constructor(@InjectModel(NotFoundHit.name) private readonly model: Model<NotFoundHitDocument>) {}

  async record(input: { path: string; referrer?: string; kind?: string }, now = new Date()): Promise<{ success: boolean }> {
    const path = normalizeNotFoundPath(input.path);
    if (!path) return { success: false };
    const kind: NotFoundKind = (NOT_FOUND_KINDS as readonly string[]).includes(input.kind ?? '') ? (input.kind as NotFoundKind) : 'route';
    const update = {
      $inc: { count: 1 },
      $set: { lastSeenAt: now, lastReferrer: sanitizeReferrer(input.referrer), dismissedAt: null, kind },
    };
    try {
      const res = await this.model.updateOne({ path }, update).exec();
      if (res.matchedCount) return { success: true };
      if ((await this.model.estimatedDocumentCount().exec()) >= MAX_DISTINCT_PATHS) return { success: false };
      await this.model.updateOne({ path }, { ...update, $setOnInsert: { firstSeenAt: now } }, { upsert: true }).exec();
      return { success: true };
    } catch (err) {
      this.logger.warn(`404 non registrato (${path}): ${(err as Error).message}`);
      return { success: false };
    }
  }

  async summary(limit = 10): Promise<NotFoundSummary> {
    const [open, top] = await Promise.all([
      this.model.countDocuments({ dismissedAt: null }).exec(),
      this.list(limit),
    ]);
    return { open, top };
  }

  async list(limit = 50): Promise<NotFoundView[]> {
    const docs = await this.model
      .find({ dismissedAt: null })
      .sort({ count: -1, lastSeenAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean()
      .exec();
    return docs.map((d) => ({
      _id: String(d._id),
      path: d.path,
      kind: d.kind,
      count: d.count,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      lastReferrer: d.lastReferrer,
    }));
  }

  async dismiss(id: string, now = new Date()): Promise<{ success: boolean }> {
    const res = await this.model.updateOne({ _id: id }, { $set: { dismissedAt: now } }).exec();
    if (!res.matchedCount) throw new NotFoundException('404 entry not found');
    return { success: true };
  }
}
