import { ConflictException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import {
  ACTIVE_LIVE_HANDOFF_STATUSES,
  LiveHandoffRequest,
  LiveHandoffRequestDocument,
} from './schemas/live-handoff-request.schema';
import { CreateLiveHandoffDto } from './dto/live-handoff.dto';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MailService } from '../mail/mail.service';
import { LiveHandoffGateway } from './live-handoff.gateway';

export interface LiveHandoffStatusDto {
  requestId: string | null;
  sessionId: string;
  status: LiveHandoffRequestDocument['status'] | 'none';
  expiresAt: Date | null;
}

export interface ActiveLiveHandoffDto {
  requestId: string;
  sessionId: string;
  status: LiveHandoffRequestDocument['status'];
  lastUserMessage: string | null;
  locale: string | null;
  requestedAt: Date;
  expiresAt: Date;
}

@Injectable()
export class LiveHandoffService {
  private readonly logger = new Logger(LiveHandoffService.name);

  constructor(
    @InjectModel(LiveHandoffRequest.name)
    private readonly model: Model<LiveHandoffRequestDocument>,
    private readonly chatbotService: ChatbotService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => LiveHandoffGateway))
    private readonly gateway: LiveHandoffGateway,
  ) {}

  async createRequest(
    sessionId: string,
    dto: CreateLiveHandoffDto,
    ip: string,
  ): Promise<LiveHandoffStatusDto> {
    const existing = await this.model
      .findOne({ sessionId, status: { $in: ACTIVE_LIVE_HANDOFF_STATUSES } })
      .exec();
    if (existing) {
      return this.toStatusDto(existing);
    }

    const dailyCap = this.config.get<number>('LIVE_HANDOFF_MAX_PER_DAY', 20);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await this.model.countDocuments({ createdAt: { $gte: startOfDay } }).exec();
    if (todayCount >= dailyCap) {
      throw new ConflictException('Live handoff request limit reached for today.');
    }

    const timeoutMinutes = this.config.get<number>('LIVE_HANDOFF_TIMEOUT_MINUTES', 15);
    const expiresAt = new Date(Date.now() + timeoutMinutes * 60_000);
    const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : undefined;

    const doc = new this.model({
      sessionId,
      status: 'requested',
      lastUserMessage: dto.lastUserMessage?.slice(0, 500),
      locale: dto.locale,
      ipHash,
      expiresAt,
    });
    await doc.save();

    // Fire-and-forget: a slow mail provider must not delay the response to the visitor.
    this.notifyGent(doc).catch((err) =>
      this.logger.error(`Failed to notify Gent of live handoff request ${String(doc._id)}`, err),
    );

    return this.toStatusDto(doc);
  }

  private async notifyGent(doc: LiveHandoffRequestDocument): Promise<void> {
    const session = await this.chatbotService.getSession(doc.sessionId).catch(() => null);

    const result = await this.mailService.sendLiveHandoffRequest({
      requestId: String(doc._id),
      sessionId: doc.sessionId,
      lastUserMessage: doc.lastUserMessage,
      locale: doc.locale,
      recentMessages: session?.messages?.slice(-6) ?? [],
      expiresAt: doc.expiresAt,
    });

    doc.status = 'notified';
    doc.notifiedAt = new Date();
    await doc.save();
    this.gateway.emitStatusChanged(doc.sessionId, doc.status);

    if (!result.success) {
      this.logger.warn(`Live handoff email not delivered for session ${doc.sessionId}`);
    }
  }

  async getStatus(sessionId: string): Promise<LiveHandoffStatusDto> {
    const doc = await this.model.findOne({ sessionId }).sort({ createdAt: -1 }).exec();
    if (!doc) {
      return { requestId: null, sessionId, status: 'none', expiresAt: null };
    }
    return this.toStatusDto(doc);
  }

  /**
   * Sessioni che Gent può ancora aprire dalla dashboard. Include di proposito anche
   * quelle già attive (agent_joining/live): serve esattamente a rientrare in una chat
   * da cui si è usciti per sbaglio, altrimenti l'unico modo per tornarci sarebbe
   * ritrovare la vecchia email di notifica.
   */
  async listActive(): Promise<ActiveLiveHandoffDto[]> {
    const docs = await this.model
      .find({ status: { $in: ACTIVE_LIVE_HANDOFF_STATUSES } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();

    return docs.map((doc: any) => ({
      requestId: String(doc._id),
      sessionId: doc.sessionId,
      status: doc.status,
      lastUserMessage: doc.lastUserMessage ?? null,
      locale: doc.locale ?? null,
      requestedAt: doc.createdAt,
      expiresAt: doc.expiresAt,
    }));
  }

  async markAgentJoining(sessionId: string): Promise<LiveHandoffStatusDto> {
    const doc = await this.model.findOne({ sessionId }).sort({ createdAt: -1 }).exec();
    if (!doc) throw new NotFoundException('Richiesta non trovata');

    // Nessuno stato blocca l'ingresso di Gent: né "expired" (timeout passivo, nessuno
    // ha risposto in tempo) né "closed" (la pagina admin chiude la sessione anche solo
    // navigando via, quindi un semplice "torna alla dashboard" lo escluderebbe dalla
    // sua stessa conversazione). L'unico caso legittimo di rifiuto è una richiesta
    // inesistente. L'endpoint è già protetto: ci si arriva solo con un JWT admin valido.
    doc.status = 'agent_joining';
    doc.respondedAt = new Date();
    await doc.save();
    this.gateway.emitStatusChanged(doc.sessionId, doc.status);
    return this.toStatusDto(doc);
  }

  async markLive(sessionId: string): Promise<void> {
    // DEVE puntare allo stesso documento su cui ha agito markAgentJoining, cioè il più
    // recente. Una sessione può avere più richieste (una scaduta e una nuova, o riaperte
    // più volte): senza `sort` questa findOne poteva portare a "live" un documento
    // vecchio, lasciando il più recente su "agent_joining". Da lì getStatus non diceva
    // mai "live" e il gateway scartava in silenzio ogni messaggio di Gent — il
    // visitatore non riceveva più nulla senza alcun errore visibile.
    const doc = await this.model.findOne({ sessionId }).sort({ createdAt: -1 }).exec();
    if (!doc || !['agent_joining', 'notified'].includes(doc.status)) return;

    doc.status = 'live';
    await doc.save();
    this.gateway.emitStatusChanged(doc.sessionId, doc.status);
  }

  async closeSession(sessionId: string): Promise<void> {
    const doc = await this.model
      .findOne({ sessionId, status: { $in: ACTIVE_LIVE_HANDOFF_STATUSES } })
      .exec();
    if (!doc) return;

    doc.status = 'closed';
    doc.closedAt = new Date();
    await doc.save();
    this.gateway.emitStatusChanged(doc.sessionId, doc.status);
  }

  /** Runs every minute: flips unanswered requests to `expired` once their deadline passes. */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleRequests(): Promise<number> {
    const stale = await this.model
      .find({ status: { $in: ['requested', 'notified'] }, expiresAt: { $lt: new Date() } })
      .exec();

    for (const doc of stale) {
      doc.status = 'expired';
      await doc.save();
      this.gateway.emitStatusChanged(doc.sessionId, doc.status);
    }
    if (stale.length > 0) {
      this.logger.log(`Expired ${stale.length} stale live handoff request(s)`);
    }
    return stale.length;
  }

  /**
   * Chiude le chat che Gent ha aperto ma non ha mai chiuso esplicitamente (basta
   * chiudere la scheda del browser). Senza questo restano "live" per sempre e si
   * accumulano nella card della dashboard, nascondendo le richieste vere.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async closeAbandonedSessions(): Promise<number> {
    const maxHours = this.config.get<number>('LIVE_HANDOFF_SESSION_MAX_HOURS', 2);
    const cutoff = new Date(Date.now() - maxHours * 3600_000);

    const abandoned = await this.model
      .find({ status: { $in: ['agent_joining', 'live'] }, createdAt: { $lt: cutoff } })
      .exec();

    for (const doc of abandoned) {
      doc.status = 'closed';
      doc.closedAt = new Date();
      await doc.save();
      this.gateway.emitStatusChanged(doc.sessionId, doc.status);
    }
    if (abandoned.length > 0) {
      this.logger.log(`Closed ${abandoned.length} abandoned live chat session(s)`);
    }
    return abandoned.length;
  }

  private toStatusDto(doc: LiveHandoffRequestDocument): LiveHandoffStatusDto {
    return {
      requestId: String(doc._id),
      sessionId: doc.sessionId,
      status: doc.status,
      expiresAt: doc.expiresAt,
    };
  }
}
