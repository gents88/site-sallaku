import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SecurityEvent, SecurityEventDocument, SecurityEventType } from './schemas/security-event.schema';
import { AuthSession, AuthSessionDocument, MAX_RETIRED_HASHES, MAX_SESSIONS_PER_USER, SESSION_TTL_DAYS } from './schemas/auth-session.schema';
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
  /** Identificativo della sessione (un dispositivo): lo stesso utente può averne più d'una. */
  sessionId: string;
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
export class SecurityService implements OnModuleInit {
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

  /**
   * Un tempo l'indice su userId era univoco (una sola sessione per utente). Va tolto per consentire
   * più dispositivi: Mongoose non elimina da solo un indice esistente quando cambiano le opzioni.
   */
  async onModuleInit(): Promise<void> {
    try {
      const indexes = await this.sessions.collection.indexes();
      const legacy = indexes.find(i => i.name === 'userId_1' && i.unique);
      if (legacy) {
        await this.sessions.collection.dropIndex('userId_1');
        this.logger.log('Indice univoco auth_sessions.userId rimosso: ora un utente può avere più sessioni.');
      }
      await this.sessions.syncIndexes();
    } catch (err) {
      this.logger.warn(`Indici di auth_sessions non allineati: ${(err as Error).message}`);
    }
  }

  // ── Sessioni (un dispositivo = una sessione) ────────────────────────────────
  // A differenza di record(), qui la sicurezza dipende dall'esito: un errore si propaga e il login
  // fallisce, invece di emettere un token il cui hash non è stato salvato.

  /** Nuovo accesso su un dispositivo: aggiunge una sessione senza toccare le altre. */
  async createSession(userId: string, sid: string, refreshTokenHash: string, ctx: ClientContext): Promise<void> {
    const now = new Date();
    await this.sessions.create({
      userId: new Types.ObjectId(userId),
      sid,
      refreshTokenHash,
      startedAt: now,
      lastSeenAt: now,
      ip: ctx.ip,
      userAgent: ctx.userAgent.slice(0, 200),
    });
    await this.pruneSessions(userId);
  }

  /** La sessione con gli hash dei refresh token (corrente e precedente), o null se non esiste più. */
  async findRefreshSession(
    userId: string,
    sid: string,
  ): Promise<{ refreshTokenHash?: string; retiredRefreshHashes?: Array<{ hash: string; retiredAt: Date }> } | null> {
    if (!Types.ObjectId.isValid(userId)) return null;
    return this.sessions
      .findOne({ userId: new Types.ObjectId(userId), sid })
      .select('+refreshTokenHash +retiredRefreshHashes')
      .lean()
      .exec();
  }

  /**
   * Rinnovo del refresh token. Confronta e scambia in un solo passo: se nel frattempo un'altra
   * richiesta ha già ruotato la sessione, non sovrascrive e restituisce false.
   */
  async rotateSession(userId: string, sid: string, expectedHash: string, newHash: string, ctx: ClientContext): Promise<boolean> {
    const now = new Date();
    const res = await this.sessions
      .updateOne(
        { userId: new Types.ObjectId(userId), sid, refreshTokenHash: expectedHash },
        {
          $set: { refreshTokenHash: newHash, lastSeenAt: now, ip: ctx.ip, userAgent: ctx.userAgent.slice(0, 200) },
          // Il token sostituito resta valido per la tolleranza, anche se nel frattempo ruotano altri.
          $push: { retiredRefreshHashes: { $each: [{ hash: expectedHash, retiredAt: now }], $slice: -MAX_RETIRED_HASHES } },
        },
      )
      .exec();
    return res.matchedCount > 0;
  }

  /** Chiude la sessione di un solo dispositivo (logout, riuso del token). */
  async endSession(userId: string, sid: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    try {
      await this.sessions.deleteOne({ userId: new Types.ObjectId(userId), sid }).exec();
    } catch (err) {
      this.logger.warn(`Session not closed for ${userId}: ${(err as Error).message}`);
    }
  }

  /** Chiude tutte le sessioni dell'utente (revoca dell'admin, cambio password o ruolo). */
  async endAllSessions(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) return;
    try {
      await this.sessions.deleteMany({ userId: new Types.ObjectId(userId) }).exec();
    } catch (err) {
      this.logger.warn(`Sessions not closed for ${userId}: ${(err as Error).message}`);
    }
  }

  /** Oltre MAX_SESSIONS_PER_USER dispositivi si chiude il meno recente: la collezione non cresce senza limite. */
  private async pruneSessions(userId: string): Promise<void> {
    try {
      const stale = await this.sessions
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ lastSeenAt: -1 })
        .skip(MAX_SESSIONS_PER_USER)
        .select('_id')
        .lean()
        .exec();
      if (stale.length) await this.sessions.deleteMany({ _id: { $in: stale.map(s => s._id) } }).exec();
    } catch (err) {
      this.logger.warn(`Sessions not pruned for ${userId}: ${(err as Error).message}`);
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
   * Sessioni attive: documenti recenti con un `sid`. Una revoca o un logout cancellano il documento,
   * quindi l'elenco è sempre quello delle sessioni davvero valide. Le sessioni create prima del
   * multi-dispositivo (senza sid) non si mostrano: passano al nuovo schema al primo rinnovo.
   */
  private async activeSessions(since: Date): Promise<SecuritySessionView[]> {
    const docs = await this.sessions
      .find({ lastSeenAt: { $gte: since }, sid: { $type: 'string' } })
      .sort({ lastSeenAt: -1 })
      .lean()
      .exec();
    if (!docs.length) return [];
    const owners = await this.users
      .find({ _id: { $in: docs.map(d => d.userId) } })
      .select('name email phone role')
      .lean()
      .exec();
    const byId = new Map(owners.map(u => [String(u._id), u]));
    return docs.flatMap(d => {
      const user = byId.get(String(d.userId));
      if (!user) return [];
      return [{
        sessionId: String(d.sid),
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

  private allowWrite(now = Date.now()): boolean {
    if (now - this.windowStart > WRITE_WINDOW_MS) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    return ++this.windowCount <= WRITE_WINDOW_MAX;
  }
}
