import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
// `import x = require` e non `import x from`: senza esModuleInterop il default import
// compila in `.default`, che per questo modulo CommonJS è undefined (TypeError a runtime).
import sanitizeHtml = require('sanitize-html');
import { MailService } from '../../mail/mail.service';
import { NewsletterSubscriber, NewsletterSubscriberDocument } from '../schemas/newsletter-subscriber.schema';
import {
  NewsletterCampaign, NewsletterCampaignDocument, NewsletterDelivery, NewsletterDeliveryDocument,
} from './newsletter-campaign.schema';
import { UpsertCampaignDto } from './campaign.dto';

/** Consegne prese in carico per tick: resta sotto i limiti di rate del provider (Resend ~10/s). */
export const BATCH_SIZE = 25;
export const MAX_ATTEMPTS = 3;
/** Una consegna "in lavorazione" da più di così (processo morto a metà) torna disponibile. */
export const LOCK_MS = 2 * 60_000;
const TICK_MS = 15_000;

/** Tag ammessi nel corpo: formattazione da newsletter, niente script/iframe/form. */
const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'span'],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    img: ['src', 'alt', 'width', 'height', 'style'],
    '*': ['style', 'align'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
};

/**
 * Campagne newsletter: bozza → invio di prova → invio (subito o
 * programmato) → coda di consegne su MongoDB elaborata a lotti.
 *
 * Perché Mongo e non Redis/Bull: Bull non è installato e REDIS_URL in
 * produzione è opzionale; una coda in memoria perderebbe le email a ogni
 * redeploy. Le righe di `newsletter_deliveries` sono la coda: durevoli,
 * riprese dopo un riavvio, e la presa in carico atomica (findOneAndUpdate
 * con lockedUntil) evita doppi invii anche con più istanze.
 */
@Injectable()
export class NewsletterCampaignsService {
  private readonly logger = new Logger(NewsletterCampaignsService.name);
  private running = false;

  constructor(
    @InjectModel(NewsletterCampaign.name) private readonly campaigns: Model<NewsletterCampaignDocument>,
    @InjectModel(NewsletterDelivery.name) private readonly deliveries: Model<NewsletterDeliveryDocument>,
    @InjectModel(NewsletterSubscriber.name) private readonly subscribers: Model<NewsletterSubscriberDocument>,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── CRUD bozze ──────────────────────────────────────────────────────────

  list() {
    return this.campaigns.find().sort({ createdAt: -1 }).limit(100).lean().exec();
  }

  async get(id: string) {
    const c = await this.campaigns.findById(id).lean().exec();
    if (!c) throw new NotFoundException(`Campaign #${id} not found`);
    return c;
  }

  create(dto: UpsertCampaignDto) {
    return this.campaigns.create({ subject: dto.subject.trim(), html: sanitizeHtml(dto.html, SANITIZE) });
  }

  async update(id: string, dto: UpsertCampaignDto) {
    const c = await this.findDraft(id);
    c.subject = dto.subject.trim();
    c.html = sanitizeHtml(dto.html, SANITIZE);
    return c.save();
  }

  async remove(id: string): Promise<void> {
    const c = await this.findDraft(id);
    await c.deleteOne();
  }

  // ── Invio ───────────────────────────────────────────────────────────────

  /** Invio di prova a un indirizzo scelto: stesso rendering della campagna, link di disiscrizione fittizio. */
  async sendTest(id: string, email: string): Promise<{ success: boolean }> {
    const c = await this.campaigns.findById(id).exec();
    if (!c) throw new NotFoundException(`Campaign #${id} not found`);
    const result = await this.mail.send(this.renderEmail(c, email, 'test'));
    if (result.success) {
      c.testSentAt = new Date();
      await c.save();
    }
    return { success: result.success };
  }

  /**
   * Fotografa i destinatari (iscritti confermati ora) e mette in coda.
   * Lo stato passa a 'scheduled'; il worker lo porta a 'sending' quando è ora.
   */
  async send(id: string, scheduledAt?: string) {
    const c = await this.findDraft(id);
    const when = scheduledAt ? new Date(scheduledAt) : new Date();
    if (Number.isNaN(when.getTime())) throw new BadRequestException('Invalid scheduledAt');

    const recipients = await this.subscribers
      .find({ status: 'confirmed' }, { email: 1, unsubscribeToken: 1 })
      .lean<Array<{ _id: Types.ObjectId; email: string; unsubscribeToken: string }>>()
      .exec();
    if (!recipients.length) throw new BadRequestException('No confirmed subscribers');

    await this.deliveries.insertMany(
      recipients.map((r) => ({
        campaignId: c._id, subscriberId: r._id, email: r.email, unsubscribeToken: r.unsubscribeToken,
      })),
      { ordered: false },
    );

    c.status = 'scheduled';
    c.scheduledAt = when;
    c.stats = { total: recipients.length, sent: 0, failed: 0 };
    await c.save();
    this.logger.log(`Campaign ${String(c._id)} queued for ${recipients.length} recipients at ${when.toISOString()}`);
    return c;
  }

  /** Ferma una campagna programmata o in corso: le consegne già fatte restano, le altre non partono. */
  async cancel(id: string) {
    const c = await this.campaigns.findById(id).exec();
    if (!c) throw new NotFoundException(`Campaign #${id} not found`);
    if (c.status !== 'scheduled' && c.status !== 'sending') throw new BadRequestException(`Cannot cancel a ${c.status} campaign`);
    c.status = 'cancelled';
    await c.save();
    return c;
  }

  // ── Worker ──────────────────────────────────────────────────────────────

  @Interval(TICK_MS)
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.campaigns.updateMany({ status: 'scheduled', scheduledAt: { $lte: now } }, { $set: { status: 'sending' } }).exec();
      const active = await this.campaigns.find({ status: 'sending' }).exec();
      for (const campaign of active) await this.processBatch(campaign, now);
    } catch (err) {
      this.logger.error('Newsletter worker tick failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  private async processBatch(campaign: NewsletterCampaignDocument, now: Date): Promise<void> {
    for (let i = 0; i < BATCH_SIZE; i++) {
      // Presa in carico atomica: due istanze non possono prendere la stessa riga.
      const delivery = await this.deliveries.findOneAndUpdate(
        {
          campaignId: campaign._id,
          status: 'pending',
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
        { new: true },
      ).exec();
      if (!delivery) break;

      const result = await this.mail.send(this.renderEmail(campaign, delivery.email, delivery.unsubscribeToken));
      if (result.success) {
        delivery.status = 'sent';
        delivery.sentAt = new Date();
        delivery.lastError = null;
      } else {
        delivery.status = delivery.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        delivery.lastError = 'Provider rejected the message';
      }
      delivery.lockedUntil = null;
      await delivery.save();
    }
    await this.refreshStats(campaign);
  }

  private async refreshStats(campaign: NewsletterCampaignDocument): Promise<void> {
    const [sent, failed, pending] = await Promise.all([
      this.deliveries.countDocuments({ campaignId: campaign._id, status: 'sent' }).exec(),
      this.deliveries.countDocuments({ campaignId: campaign._id, status: 'failed' }).exec(),
      this.deliveries.countDocuments({ campaignId: campaign._id, status: 'pending' }).exec(),
    ]);
    campaign.stats = { total: campaign.stats.total, sent, failed };
    if (pending === 0) {
      campaign.status = 'sent';
      campaign.sentAt = new Date();
      this.logger.log(`Campaign ${String(campaign._id)} completed: ${sent} sent, ${failed} failed`);
    }
    await campaign.save();
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  /** Corpo + footer con disiscrizione personale + header List-Unsubscribe (one-click, RFC 8058). */
  renderEmail(campaign: Pick<NewsletterCampaign, 'subject' | 'html'>, to: string, unsubscribeToken: string) {
    const frontend = this.config.get<string>('FRONTEND_URL', 'https://gentsallaku.it');
    const api = this.config.get<string>('PUBLIC_API_URL', 'https://portfolio-backend-production-e76d.up.railway.app/api/v1');
    const token = encodeURIComponent(unsubscribeToken);
    const unsubscribePage = `${frontend}/newsletter/unsubscribe?token=${token}`;
    const oneClick = `${api}/newsletter/unsubscribe?token=${token}`;
    return {
      to,
      subject: campaign.subject,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;line-height:1.6;">
          ${campaign.html}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;" />
          <p style="font-size:12px;color:#64748b;text-align:center;">
            Ricevi questa email perché sei iscritto alla newsletter di gentsallaku.it.
            <a href="${unsubscribePage}" style="color:#64748b;">Annulla l'iscrizione</a>
          </p>
        </div>`,
      text: `${sanitizeHtml(campaign.html, { allowedTags: [], allowedAttributes: {} }).trim()}\n\n—\nAnnulla l'iscrizione: ${unsubscribePage}`,
      headers: {
        'List-Unsubscribe': `<${oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  }

  private async findDraft(id: string): Promise<NewsletterCampaignDocument> {
    const c = await this.campaigns.findById(id).exec();
    if (!c) throw new NotFoundException(`Campaign #${id} not found`);
    if (c.status !== 'draft') throw new BadRequestException('Only draft campaigns can be modified');
    return c;
  }
}
