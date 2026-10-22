import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SecurityEvent, SecurityEventDocument, SecurityEventType } from './schemas/security-event.schema';
import { AuthSession, AuthSessionDocument, SESSION_TTL_DAYS } from './schemas/auth-session.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { describeDevice, maskIdentifier } from './device';

/** Da dove arriva la richiesta: ricavato dal controller, mai dal body. */
export interface ClientContext {
  ip: string;
  userAgent: string;
}

export interface SecurityEventExtra {
  userId?: string | null;
  identifier?: string;
  detail?: string;
}

export interface SecuritySessionView {
  userId: string;
  name: string;
  contact: string;
  role: string;
  device: string;
  ip: string;
  startedAt: string;
  lastSeenAt: string;
}

export interface SecurityEventView {
  _id: string;
  type: SecurityEventType;
  ip: string;
  device: string;
  identifier: string;
  detail: string;
  createdAt: string;
}

export interface SecuritySummary {
  failedLogins24h: number;
  otpFailed24h: number;
  /** Rifiuti per riuso di un refresh token già ruotato: indizio di un token rubato. */
  tokenReuse7d: number;
  activeSessions: number;
  /** IP con almeno 5 tentativi falliti nelle ultime 24 ore. */
  suspiciousIps: Array<{ ip: string; failures: number }>;
  sessions: SecuritySessionView[];
  events: SecurityEventView[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const SUSPICIOUS_IP_THRESHOLD = 5;
const RECENT_EVENTS = 15;
/** Tetto di scritture in una finestra: un attacco distribuito non deve martellare Mongo. */
const WRITE_WINDOW_MS = 10_000;
const WRITE_WINDOW_MAX = 60;

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private windowStart = 0;
  private windowCount = 0;

  constructor(
    @InjectModel(SecurityEvent.name) private readonly events: Model<SecurityEventDocument>,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSessionDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  /** Registra un evento. Non lancia mai: la sicurezza non deve rompere il login. */
  async record(type: SecurityEventType, ctx: ClientContext, extra: SecurityEventExtra = {}): Promise<void> {
    if (!this.allowWrite()) return;
    try {
      await this.events.create({
        type,
        ip: ctx.ip,
        userAgent: ctx.userAgent.slice(0, 200),
        userId: extra.userId && Types.ObjectId.isValid(extra.userId) ? new Types.ObjectId(extra.userId) : null,
        identifier: maskIdentifier(extra.identifier),
        detail: (extra.detail ?? '').slice(0, 200),
      });
    } catch (err) {
      this.logger.warn(`Security event "${type}" not saved: ${(err as Error).message}`);
    }
  }

  /** Nuovo accesso: la sessione parte da adesso (sostituisce quella precedente). */
  async startSession(userId: string, ctx: ClientContext): Promise<void> {
    const now = new Date();
    await this.upsertSession(userId, ctx, { startedAt: now, lastSeenAt: now });
  }

  /** Rinnovo del refresh token: aggiorna "ultima attività" e da dove, senza toccare l'inizio. */
  async touchSession(userId: string, ctx: ClientContext): Promise<void> {
    const now = new Date();
    await this.upsertSession(userId, ctx, { lastSeenAt: now }, { startedAt: now });
  }

  async endSession(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    try {
      await this.sessions.deleteOne({ userId: new Types.ObjectId(userId) }).exec();
    } catch (err) {
      this.logger.warn(`Session not closed for ${userId}: ${(err as Error).message}`);
    }
  }

  async summary(now: Date = new Date()): Promise<SecuritySummary> {
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const sessionSince = new Date(now.getTime() - SESSION_TTL_DAYS * DAY_MS);

    const [failedLogins24h, otpFailed24h, tokenReuse7d, ipRows, recent, sessions] = await Promise.all([
      this.events.countDocuments({ type: 'login_failed', createdAt: { $gte: since24h } }).exec(),
      this.events.countDocuments({ type: 'otp_failed', createdAt: { $gte: since24h } }).exec(),
      this.events.countDocuments({ type: 'refresh_reuse', createdAt: { $gte: since7d } }).exec(),
      this.events
        .aggregate<{ _id: string; failures: number }>([
          { $match: { type: { $in: ['login_failed', 'otp_failed'] }, createdAt: { $gte: since24h }, ip: { $ne: '' } } },
          { $group: { _id: '$ip', failures: { $sum: 1 } } },
          { $match: { failures: { $gte: SUSPICIOUS_IP_THRESHOLD } } },
          { $sort: { failures: -1 } },
          { $limit: 5 },
        ])
        .exec(),
      this.events.find().sort({ createdAt: -1 }).limit(RECENT_EVENTS).lean().exec(),
      this.activeSessions(sessionSince),
    ]);

    return {
      failedLogins24h,
      otpFailed24h,
      tokenReuse7d,
      activeSessions: sessions.length,
      suspiciousIps: ipRows.map(r => ({ ip: r._id, failures: r.failures })),
      sessions,
      events: recent.map(e => ({
        _id: String(e._id),
        type: e.type,
        ip: e.ip,
        device: describeDevice(e.userAgent),
        identifier: e.identifier,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Sessioni davvero valide: documento recente E refresh token ancora presente
   * sull'utente (una revoca da /users/:id/revoke-sessions o un logout lo azzera
   * senza passare da qui, e la sessione sparisce comunque dall'elenco).
   */
  private async activeSessions(since: Date): Promise<SecuritySessionView[]> {
    const docs = await this.sessions.find({ lastSeenAt: { $gte: since } }).sort({ lastSeenAt: -1 }).lean().exec();
    if (!docs.length) return [];
    const owners = await this.users
      .find({ _id: { $in: docs.map(d => d.userId) }, refreshTokenHash: { $ne: null } })
      .select('name email phone role')
      .lean()
      .exec();
    const byId = new Map(owners.map(u => [String(u._id), u]));
    return docs.flatMap(d => {
      const user = byId.get(String(d.userId));
      if (!user) return [];
      return [{
        userId: String(d.userId),
        name: user.name,
        contact: user.email ?? user.phone ?? '',
        role: user.role,
        device: describeDevice(d.userAgent),
        ip: d.ip,
        startedAt: d.startedAt.toISOString(),
        lastSeenAt: d.lastSeenAt.toISOString(),
      }];
    });
  }

  private async upsertSession(
    userId: string,
    ctx: ClientContext,
    set: Partial<Pick<AuthSession, 'startedAt' | 'lastSeenAt'>>,
    setOnInsert: Partial<Pick<AuthSession, 'startedAt'>> = {},
  ): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    try {
      await this.sessions
        .updateOne(
          { userId: new Types.ObjectId(userId) },
          { $set: { ...set, ip: ctx.ip, userAgent: ctx.userAgent.slice(0, 200) }, $setOnInsert: setOnInsert },
          { upsert: true },
        )
        .exec();
    } catch (err) {
      this.logger.warn(`Session not saved for ${userId}: ${(err as Error).message}`);
    }
  }

  private allowWrite(now = Date.now()): boolean {
    if (now - this.windowStart > WRITE_WINDOW_MS) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    return ++this.windowCount <= WRITE_WINDOW_MAX;
  }
}
