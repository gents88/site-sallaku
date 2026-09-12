import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import {
  NewsletterSubscriber,
  NewsletterSubscriberDocument,
  NewsletterStatus,
} from './schemas/newsletter-subscriber.schema';
import { SubscribeDto } from './dto/subscribe.dto';
import { MailService } from '../mail/mail.service';
import { TurnstileService } from '../common/services/turnstile.service';
import { csvCell } from '../common/utils/analytics-geo.util';

const CONFIRM_TOKEN_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48h

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectModel(NewsletterSubscriber.name)
    private readonly model: Model<NewsletterSubscriberDocument>,
    private readonly mailService: MailService,
    private readonly turnstile: TurnstileService,
  ) {}

  /**
   * Public: subscribe, or re-send the confirm email for a pending/lapsed
   * subscription. Always returns the same generic message regardless of
   * what actually happened — an already-confirmed address must not be
   * distinguishable from a brand new one (email enumeration).
   */
  async subscribe(dto: SubscribeDto, ip?: string): Promise<{ message: string }> {
    if (dto.website) {
      this.logger.warn(`[Newsletter] Honeypot triggered for ${dto.email} — request rejected`);
      throw new BadRequestException('Bot detected');
    }

    if (!(await this.turnstile.verify(dto.turnstileToken, ip))) {
      throw new BadRequestException('Verification failed. Please try again.');
    }

    const email = dto.email.toLowerCase().trim();
    const generic = { message: 'Check your inbox to confirm your subscription.' };

    const existing = await this.model.findOne({ email }).exec();
    if (existing?.status === 'confirmed') {
      return generic;
    }

    const { token, hash, expires } = this.issueConfirmToken();

    if (existing) {
      // Pending or previously unsubscribed — re-issue a fresh confirm token
      // either way; re-subscribing after unsubscribing needs fresh consent,
      // not silent reactivation.
      existing.confirmTokenHash = hash;
      existing.confirmTokenExpires = expires;
      existing.status = 'pending';
      await existing.save();
      await this.mailService.sendNewsletterConfirm(email, token);
      return generic;
    }

    await this.model.create({
      email,
      status: 'pending',
      confirmTokenHash: hash,
      confirmTokenExpires: expires,
      unsubscribeToken: randomBytes(24).toString('hex'),
    });
    await this.mailService.sendNewsletterConfirm(email, token);
    return generic;
  }

  /** Public: confirm a pending subscription (proof of ownership — the token only ever left our system inside the confirm email). */
  async confirm(token: string): Promise<{ email: string }> {
    if (!token) throw new BadRequestException('Missing token');

    const subscriber = await this.model
      .findOne({ confirmTokenHash: this.hashToken(token), confirmTokenExpires: { $gt: new Date() } })
      .select('+confirmTokenHash +confirmTokenExpires')
      .exec();

    if (!subscriber) {
      throw new BadRequestException('This confirmation link is invalid or has expired.');
    }

    subscriber.status = 'confirmed';
    subscriber.confirmedAt = new Date();
    subscriber.confirmTokenHash = undefined;
    subscriber.confirmTokenExpires = undefined;
    await subscriber.save();

    return { email: subscriber.email };
  }

  /** Public: unsubscribe via the long-lived token embedded in every email. */
  async unsubscribe(token: string): Promise<{ email: string }> {
    if (!token) throw new BadRequestException('Missing token');

    const subscriber = await this.model.findOne({ unsubscribeToken: token }).exec();
    if (!subscriber) {
      throw new NotFoundException('Subscription not found.');
    }

    if (subscriber.status !== 'unsubscribed') {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date();
      await subscriber.save();
    }

    return { email: subscriber.email };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async findPaginated(page = 1, limit = 20, status?: NewsletterStatus): Promise<{
    data: NewsletterSubscriberDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const filter = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean().exec() as unknown as Promise<NewsletterSubscriberDocument[]>,
      this.model.countDocuments(filter).exec(),
    ]);

    return { data, total, page: Math.max(page, 1), totalPages: Math.ceil(total / safeLimit) };
  }

  async counts(): Promise<Record<NewsletterStatus, number> & { total: number }> {
    const [pending, confirmed, unsubscribed, total] = await Promise.all([
      this.model.countDocuments({ status: 'pending' }).exec(),
      this.model.countDocuments({ status: 'confirmed' }).exec(),
      this.model.countDocuments({ status: 'unsubscribed' }).exec(),
      this.model.countDocuments().exec(),
    ]);
    return { pending, confirmed, unsubscribed, total };
  }

  async remove(id: string): Promise<void> {
    await this.model.findByIdAndDelete(id).exec();
  }

  /** Export/history side: raw CSV string — the controller sets the response headers. */
  async exportCsv(): Promise<string> {
    const subscribers = await this.model
      .find()
      .select('email status createdAt confirmedAt')
      .sort({ createdAt: -1 })
      .limit(50_000) // safety cap to prevent gigantic exports
      .lean()
      .exec();

    const header = 'email,status,subscribedAt,confirmedAt';
    const rows = (subscribers as Array<Record<string, unknown>>).map((s) => [
      csvCell(String(s['email'] ?? '')),
      csvCell(String(s['status'] ?? '')),
      s['createdAt'] instanceof Date ? (s['createdAt'] as Date).toISOString() : '',
      s['confirmedAt'] instanceof Date ? (s['confirmedAt'] as Date).toISOString() : '',
    ].join(','));

    return [header, ...rows].join('\n');
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private issueConfirmToken(): { token: string; hash: string; expires: Date } {
    const token = randomBytes(24).toString('hex');
    return {
      token,
      hash: this.hashToken(token),
      expires: new Date(Date.now() + CONFIRM_TOKEN_EXPIRY_MS),
    };
  }
}
