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

  async listPending() {
    return this.model
      .find({ status: { $in: ['requested', 'notified'] } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async markAgentJoining(sessionId: string): Promise<LiveHandoffStatusDto> {
    const doc = await this.model.findOne({ sessionId }).sort({ createdAt: -1 }).exec();
    if (!doc) throw new NotFoundException('Richiesta non trovata');
    if (!ACTIVE_LIVE_HANDOFF_STATUSES.includes(doc.status)) {
      throw new ConflictException('Questa richiesta non è più attiva.');
    }

    doc.status = 'agent_joining';
    doc.respondedAt = new Date();
    await doc.save();
    this.gateway.emitStatusChanged(doc.sessionId, doc.status);
    return this.toStatusDto(doc);
  }

  async markLive(sessionId: string): Promise<void> {
    const doc = await this.model
      .findOne({ sessionId, status: { $in: ['agent_joining', 'notified'] } })
      .exec();
    if (!doc) return;

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

  private toStatusDto(doc: LiveHandoffRequestDocument): LiveHandoffStatusDto {
    return {
      requestId: String(doc._id),
      sessionId: doc.sessionId,
      status: doc.status,
      expiresAt: doc.expiresAt,
    };
  }
}
