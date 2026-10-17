import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { NewsletterCampaignsService } from '../newsletter/campaigns/newsletter-campaigns.service';
import { escapeHtmlEntities as escapeHtml } from '../common/utils/html-escape.util';

export const BLOG_SCHEDULER_JOB = 'blog-scheduled-publish';

export interface ScheduledPostView {
  _id: string;
  title: string;
  slug: string;
  scheduledAt: Date;
  notifySubscribers: boolean;
}

/** Email della campagna per un post appena uscito: titolo, estratto, copertina e link. */
export function postAnnouncementHtml(post: { title: string; excerpt?: string; coverImage?: string; slug: string }, siteUrl: string): string {
  const url = `${siteUrl.replace(/\/$/, '')}/blog/${encodeURIComponent(post.slug)}`;
  const cover = post.coverImage
    ? `<p><img src="${escapeHtml(post.coverImage)}" alt="" width="560" style="max-width:100%;border-radius:12px"></p>`
    : '';
  return [
    `<h1>${escapeHtml(post.title)}</h1>`,
    cover,
    post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : '',
    `<p><a href="${escapeHtml(url)}">Leggi l'articolo →</a></p>`,
  ].join('\n');
}

/**
 * Pubblicazione programmata: ogni minuto mette online i post con scheduledAt
 * passato. Il passaggio a pubblicato è atomico (filtro su published: false),
 * quindi due istanze o un tick lento non pubblicano né annunciano due volte.
 */
@Injectable()
export class BlogSchedulerService {
  private readonly logger = new Logger(BlogSchedulerService.name);
  private running = false;

  constructor(
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    private readonly config: ConfigService,
    @Optional() private readonly campaigns?: NewsletterCampaignsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: BLOG_SCHEDULER_JOB })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishDue();
    } catch (err) {
      this.logger.error(`Pubblicazione programmata fallita: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async publishDue(now = new Date()): Promise<string[]> {
    const due = await this.posts
      .find({ published: false, scheduledAt: { $ne: null, $lte: now } }, { title: 1, slug: 1, excerpt: 1, coverImage: 1, scheduledAt: 1, publishedAt: 1, notifySubscribers: 1 })
      .lean()
      .exec();

    const published: string[] = [];
    for (const post of due) {
      const res = await this.posts
        .updateOne(
          { _id: post._id, published: false, scheduledAt: post.scheduledAt },
          { $set: { published: true, publishedAt: post.publishedAt ?? post.scheduledAt ?? now, scheduledAt: null } },
        )
        .exec();
      if (!res.modifiedCount) continue; // già pubblicato o riprogrammato nel frattempo
      published.push(String(post._id));
      this.logger.log(`Pubblicato all'orario programmato: "${post.title}"`);
      if (post.notifySubscribers) await this.announce(post);
    }
    return published;
  }

  async upcoming(limit = 10): Promise<ScheduledPostView[]> {
    const docs = await this.posts
      .find({ published: false, scheduledAt: { $ne: null } }, { title: 1, slug: 1, scheduledAt: 1, notifySubscribers: 1 })
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) => ({
      _id: String(d._id),
      title: d.title,
      slug: d.slug,
      scheduledAt: d.scheduledAt as Date,
      notifySubscribers: !!d.notifySubscribers,
    }));
  }

  /** Crea e invia la campagna. Un errore (nessun iscritto, mail giù) non annulla la pubblicazione. */
  private async announce(post: { title: string; slug: string; excerpt?: string; coverImage?: string }): Promise<void> {
    if (!this.campaigns) return;
    try {
      const siteUrl = this.config.get<string>('FRONTEND_URL', 'https://gentsallaku.it');
      const campaign = await this.campaigns.create({ subject: post.title, html: postAnnouncementHtml(post, siteUrl) });
      await this.campaigns.send(String(campaign._id));
      this.logger.log(`Newsletter in coda per "${post.title}"`);
    } catch (err) {
      this.logger.warn(`Annuncio newsletter non inviato per "${post.title}": ${(err as Error).message}`);
    }
  }
}
