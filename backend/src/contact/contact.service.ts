import { Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { ContactDto } from './dto/contact.dto';
import { ContactMessage, ContactMessageDocument } from './schemas/contact-message.schema';
import { TurnstileService } from '../common/services/turnstile.service';
import { escapeRegex } from '../common/utils/escape-regex';
import { AdminEventsService } from '../common/services/admin-events.service';
import {
  LEAD_STATUSES, LEAD_STATUS_EXPR, LeadStatus, OPEN_LEAD_STATUSES, averageResponseHours, endOfTodayRome,
} from './lead';

export interface LeadFollowUp {
  _id: string;
  name: string;
  subject: string;
  followUpAt: Date;
  status: LeadStatus;
}

export interface LeadStats {
  byStatus: Record<LeadStatus, number>;
  /** Ore medie fra arrivo e prima risposta, ultimi 90 giorni; null senza risposte. */
  avgFirstResponseHours: number | null;
  /** Vinti / (vinti + persi), in %; null se non c'è ancora nulla di chiuso. */
  winRate: number | null;
  followUpsDue: number;
  followUps: LeadFollowUp[];
}

/** I duplicati (stesso messaggio entro 60 s) non sono lead a parte. */
const NOT_DUPLICATE = { duplicateOf: { $exists: false } };

interface ContactCountByDay {
  date: string;
  count: number;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectModel(ContactMessage.name)
    private contactModel: Model<ContactMessageDocument>,
    private mailService: MailService,
    private mailQueue: MailQueueService,
    private turnstile: TurnstileService,
    // @Optional: i test che costruiscono il servizio a mano non devono conoscere il bus.
    @Optional() private readonly adminEvents?: AdminEventsService,
  ) {}

  async sendMessage(dto: ContactDto, meta?: { ip?: string; location?: string }): Promise<{ success: boolean }> {
    // Server-side honeypot check — bots that fill all fields are rejected
    if (dto.website) {
      this.logger.warn(`[Contact] Honeypot triggered for ${dto.email} — request rejected`);
      throw new BadRequestException('Bot detected');
    }

    if (!(await this.turnstile.verify(dto.turnstileToken, meta?.ip))) {
      this.logger.warn(`[Contact] Turnstile verification failed for ${dto.email}`);
      throw new BadRequestException('Verification failed. Please try again.');
    }

    // Prevent obvious duplicates: same email+message within last 60s
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const duplicate = await this.contactModel.findOne({
      email: dto.email,
      message: dto.message,
      createdAt: { $gte: oneMinuteAgo },
    }).exec();

    if (duplicate) {
      this.logger.warn(`Duplicate contact detected for ${dto.email} — ignoring duplicate within window`);
      // Persisting a duplicate could be avoided; but still record it for audit
      await this.contactModel.create({ ...dto, duplicateOf: duplicate._id } as any);
      return { success: true };
    }

    // 1. Persist the message (authoritative store)
    const created = await this.contactModel.create(dto);
    this.adminEvents?.notify('contact', dto.subject);

    // 2. Enqueue notification job (fast, reliable delivery via queue)
    try {
      await this.mailQueue.enqueueContact({
        name: dto.name,
        email: dto.email,
        subject: dto.subject,
        message: dto.message,
        contactId: String(created._id),
        ip: meta?.ip,
        location: meta?.location,
      });
    } catch (err) {
      this.logger.error('Failed to enqueue mail job', err as any);
      // Best-effort: still return success to the caller (optimistic UX) and worker will retry
    }

    return { success: true };
  }

  async count(): Promise<number> {
    return this.contactModel.countDocuments().exec();
  }

  async countUnread(): Promise<number> {
    return this.contactModel.countDocuments({ read: false }).exec();
  }

  async findAll(limit = 20) {
    return this.contactModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  /** Fetch all messages received today (since midnight UTC of the current server date). */
  async findToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.contactModel
      .find({ createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async markAsRead(id: string, read = true) {
    const message = await this.contactModel.findByIdAndUpdate(
      id,
      { read },
      { new: true },
    ).exec();

    if (!message) {
      throw new NotFoundException('Contact message not found');
    }

    return message;
  }

  async deleteMessage(id: string): Promise<{ success: boolean }> {
    const message = await this.contactModel.findByIdAndDelete(id).exec();

    if (!message) {
      throw new NotFoundException('Contact message not found');
    }

    return { success: true };
  }

  async deleteMany(ids: string[]): Promise<{ success: boolean; deleted: number }> {
    const result = await this.contactModel.deleteMany({ _id: { $in: ids } }).exec();
    return { success: true, deleted: result.deletedCount };
  }

  /** Send a reply email to a contact and record it on the document. */
  async replyToContact(id: string, replyText: string): Promise<ContactMessageDocument> {
    const contact = await this.contactModel.findById(id).exec();
    if (!contact) throw new NotFoundException('Contact message not found');

    const html = `
      <p>Hi <strong>${contact.name}</strong>,</p>
      <p>${replyText.replace(/\n/g, '<br>')}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <p style="color:#64748b;font-size:0.85rem;">
        This is a reply to your message: <em>"${contact.subject}"</em>
      </p>`;

    await this.mailService.send({
      to: contact.email,
      subject: `Re: ${contact.subject}`,
      html,
      text: replyText,
    });

    contact.repliedAt = new Date();
    contact.replyText = replyText;
    contact.read = true;
    // Rispondere a un lead nuovo lo porta "in trattativa"; uno già chiuso resta com'è.
    if (!contact.status || contact.status === 'new') contact.status = 'in_progress';
    return contact.save();
  }

  /** Stato, promemoria e nota interna di un messaggio. */
  async updateLead(id: string, dto: { status?: LeadStatus; followUpAt?: string | null; internalNote?: string }) {
    const set: Record<string, unknown> = {};
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.followUpAt !== undefined) set.followUpAt = dto.followUpAt ? new Date(dto.followUpAt) : null;
    if (dto.internalNote !== undefined) set.internalNote = dto.internalNote.trim();
    const contact = await this.contactModel.findByIdAndUpdate(id, { $set: set }, { new: true }).exec();
    if (!contact) throw new NotFoundException('Contact message not found');
    return contact;
  }

  private followUpsDueFilter(now: Date): Record<string, unknown> {
    return {
      ...NOT_DUPLICATE,
      followUpAt: { $ne: null, $lte: endOfTodayRome(now) },
      $expr: { $in: [LEAD_STATUS_EXPR, [...OPEN_LEAD_STATUSES]] },
    };
  }

  /** Per il campanello: follow-up scaduti o di oggi, su lead ancora aperti. */
  async countFollowUpsDue(now = new Date()): Promise<number> {
    return this.contactModel.countDocuments(this.followUpsDueFilter(now)).exec();
  }

  async leadStats(now = new Date()): Promise<LeadStats> {
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [grouped, replied, followUps, followUpsDue] = await Promise.all([
      this.contactModel.aggregate<{ _id: LeadStatus; count: number }>([
        { $match: NOT_DUPLICATE },
        { $group: { _id: LEAD_STATUS_EXPR, count: { $sum: 1 } } },
      ]).exec(),
      this.contactModel
        .find({ ...NOT_DUPLICATE, createdAt: { $gte: since }, repliedAt: { $ne: null } }, 'createdAt repliedAt')
        .lean()
        .exec(),
      this.contactModel
        .find(this.followUpsDueFilter(now), 'name subject followUpAt status repliedAt')
        .sort({ followUpAt: 1 })
        .limit(5)
        .lean()
        .exec(),
      this.countFollowUpsDue(now),
    ]);

    const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const row of grouped) if (row._id in byStatus) byStatus[row._id] = row.count;
    const closed = byStatus.won + byStatus.lost;

    return {
      byStatus,
      avgFirstResponseHours: averageResponseHours(replied as Array<{ createdAt?: Date; repliedAt?: Date | null }>),
      winRate: closed ? Math.round((byStatus.won / closed) * 100) : null,
      followUpsDue,
      followUps: followUps.map((f) => ({
        _id: String(f._id),
        name: f.name,
        subject: f.subject,
        followUpAt: f.followUpAt as Date,
        status: (f.status as LeadStatus | undefined) ?? (f.repliedAt ? 'in_progress' : 'new'),
      })),
    };
  }

  /** Paginated list for the admin dashboard — avoids returning unbounded collections. */
  async findPaginated(opts: { page: number; limit: number; unreadOnly?: boolean; q?: string; status?: LeadStatus; followUpsDue?: boolean }): Promise<{
    data: ContactMessageDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, unreadOnly } = opts;
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const filter: Record<string, unknown> = unreadOnly ? { read: false } : {};
    if (opts.followUpsDue) Object.assign(filter, this.followUpsDueFilter(new Date()));
    // Lo stato si confronta con la stessa regola dei messaggi vecchi senza `status`.
    if (opts.status) {
      const byStatus = { $eq: [LEAD_STATUS_EXPR, opts.status] };
      filter.$expr = filter.$expr ? { $and: [filter.$expr, byStatus] } : byStatus;
    }
    const q = opts.q?.trim();
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: re }, { email: re }, { subject: re }, { message: re }];
    }

    const [data, total] = await Promise.all([
      this.contactModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).exec(),
      this.contactModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page: Math.max(page, 1), totalPages: Math.ceil(total / safeLimit) };
  }

  async countByDay(days = 7): Promise<ContactCountByDay[]> {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const results = await this.contactModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          createdAt: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    const counts = new Map(results.map(item => [item._id, item.count]));

    return Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        count: counts.get(key) ?? 0,
      };
    });
  }
}
