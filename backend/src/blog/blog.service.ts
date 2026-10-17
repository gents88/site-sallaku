import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { BLOG_SLUG_FIELDS, DEFAULT_BLOG_LANGUAGE, TRANSLATED_BLOG_LANGUAGES } from './blog.constants';
import { PostForHealth, PostTranslationHealth, TranslationHealthSummary, summarizeAnalyzed, toPostHealth } from './translation-health';

interface ContentSummary {
  total: number;
  published: number;
  drafts: number;
}

/** Mongo filter matching a post by its Italian slug or any per-language slug. */
function anySlug(slug: string) {
  return { $or: BLOG_SLUG_FIELDS.map(field => ({ [field]: slug })) };
}

/**
 * La lista pubblica serve solo titolo, estratto, copertina e slug (PostSummary
 * nel frontend): il corpo dell'articolo in tutte le lingue pesava ~66 KB a post,
 * ~5 MB per 50 articoli, e finiva incorporato nell'HTML prerenderizzato di /blog.
 */
const LIST_EXCLUDED_FIELDS = '-content -content_en -content_sq -content_pt -content_es -content_fr -content_de';

/** Il controllo traduzioni legge il corpo di ogni post in 7 lingue: si ricalcola al massimo ogni 10 minuti o dopo una modifica. */
const TRANSLATION_HEALTH_TTL_MS = 10 * 60_000;
const TRANSLATION_HEALTH_FIELDS = [
  'title', 'slug', 'published', 'content', 'sourceUpdatedAt', 'translationsUpdatedAt',
  ...TRANSLATED_BLOG_LANGUAGES.flatMap(l => [`title_${l}`, `content_${l}`]),
].join(' ');

/**
 * Date da aggiornare in un salvataggio: sourceUpdatedAt se cambiano titolo o
 * contenuto italiani, translationsUpdatedAt.xx se cambia quella traduzione.
 * L'autosave rimanda tutto il form ogni pochi secondi: conta solo ciò che è
 * davvero diverso da quanto salvato.
 */
export function translationTimestamps(
  dto: Record<string, unknown>,
  existing: Record<string, unknown>,
  now: Date,
): Record<string, Date> {
  const changed = (field: string) => dto[field] !== undefined && (dto[field] ?? '') !== (existing[field] ?? '');
  const out: Record<string, Date> = {};
  if (changed('title') || changed('content')) out.sourceUpdatedAt = now;
  for (const lang of TRANSLATED_BLOG_LANGUAGES) {
    if (changed(`title_${lang}`) || changed(`content_${lang}`)) out[`translationsUpdatedAt.${lang}`] = now;
  }
  return out;
}

@Injectable()
export class BlogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BlogService.name);
  private translationHealthCache: { at: number; value: TranslationHealthSummary } | null = null;

  constructor(@InjectModel(Post.name) private postModel: Model<PostDocument>) {}

  /** Fills slug_xx for posts created before per-language slugs existed. Idempotent. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const filled = await this.backfillLocalizedSlugs();
      if (filled) this.logger.log(`Generated per-language slugs for ${filled} post(s)`);
    } catch (err) {
      this.logger.error(`Per-language slug backfill failed: ${(err as Error).message}`);
    }
  }

  /**
   * Unique across EVERY slug field of every other post, so a URL like
   * /xx/blog/<slug> always resolves to exactly one post whatever language
   * the slug came from.
   */
  private async ensureUniqueSlug(source: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(source, { lower: true, strict: true }) || `post-${Date.now()}`;
    let candidate = baseSlug;
    let index = 2;

    while (await this.postModel.exists({ ...anySlug(candidate), ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
      candidate = `${baseSlug}-${index}`;
      index += 1;
    }

    return candidate;
  }

  /**
   * Sets slug_xx from title_xx for every language that has a translated
   * title but no slug yet. Existing slugs are never touched — they're in
   * URLs people have already shared.
   */
  private async fillLocalizedSlugs(
    target: Record<string, unknown>,
    source: object = {},
    excludeId?: string,
  ): Promise<void> {
    const existing = source as Record<string, unknown>;
    for (const lang of TRANSLATED_BLOG_LANGUAGES) {
      if (existing[`slug_${lang}`]) continue;
      const title = (target[`title_${lang}`] ?? existing[`title_${lang}`]) as string | undefined;
      if (title?.trim()) target[`slug_${lang}`] = await this.ensureUniqueSlug(title, excludeId);
    }
  }

  async backfillLocalizedSlugs(): Promise<number> {
    const missing = await this.postModel
      .find({
        $or: TRANSLATED_BLOG_LANGUAGES.map(lang => ({
          [`title_${lang}`]: { $nin: ['', null] },
          [`slug_${lang}`]: { $in: ['', null] },
        })),
      })
      .lean()
      .exec() as unknown as Array<Record<string, unknown> & { _id: unknown }>;

    let filled = 0;
    for (const post of missing) {
      const update: Record<string, unknown> = {};
      await this.fillLocalizedSlugs(update, post, String(post._id));
      if (Object.keys(update).length) {
        await this.postModel.updateOne({ _id: post._id }, { $set: update }).exec();
        filled += 1;
      }
    }
    return filled;
  }

  /** Auto-generate a short excerpt from HTML/plain content. */
  private autoExcerpt(content: string, maxLen = 200): string {
    const stripped = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (stripped.length <= maxLen) return stripped;
    const cut = stripped.lastIndexOf(' ', maxLen);
    return stripped.slice(0, cut > 0 ? cut : maxLen) + '…';
  }

  /** Public: published posts only, paginated */
  async findPublished(tag?: string, page = 1, limit = 10): Promise<{
    data: PostDocument[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const filter: Record<string, unknown> = { published: true };
    if (tag) filter.tags = tag;

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .select(LIST_EXCLUDED_FIELDS)
        .lean()
        .exec() as unknown as Promise<PostDocument[]>,
      this.postModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page: Math.max(page, 1), totalPages: Math.ceil(total / safeLimit) };
  }

  /** Public: single post by its Italian or any per-language slug */
  async findBySlug(slug: string): Promise<PostDocument> {
    const post = await this.postModel.findOne({ ...anySlug(slug), published: true }).exec();
    if (!post) throw new NotFoundException(`Post "${slug}" not found`);
    return post;
  }

  /** Admin: all posts — with optional pagination (omit page/limit to get all) */
  async findAll(page?: number, limit?: number): Promise<PostDocument[] | { data: PostDocument[]; total: number; page: number; totalPages: number }> {
    if (page !== undefined || limit !== undefined) {
      const safeLimit = Math.min(Math.max(limit ?? 50, 1), 200);
      const safePage  = Math.max(page ?? 1, 1);
      const skip = (safePage - 1) * safeLimit;
      const [data, total] = await Promise.all([
        this.postModel.find().sort({ createdAt: -1 }).skip(skip).limit(safeLimit).exec() as unknown as Promise<PostDocument[]>,
        this.postModel.countDocuments().exec(),
      ]);
      return { data, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
    }
    return this.postModel.find().sort({ createdAt: -1 }).exec();
  }

  /** Admin: single post by id */
  async findOne(id: string): Promise<PostDocument> {
    const post = await this.postModel.findById(id).exec();
    if (!post) throw new NotFoundException(`Post #${id} not found`);
    return post;
  }

  async create(dto: CreatePostDto): Promise<PostDocument> {
    const slug = await this.ensureUniqueSlug(dto.slug || dto.title);
    const publishedAt = dto.published ? new Date() : null;
    const excerpt = dto.excerpt || this.autoExcerpt(dto.content);
    const localizedSlugs: Record<string, unknown> = {};
    await this.fillLocalizedSlugs(localizedSlugs, dto);
    const now = new Date();
    const translationsUpdatedAt = Object.fromEntries(
      TRANSLATED_BLOG_LANGUAGES.filter(l => (dto as unknown as Record<string, unknown>)[`content_${l}`]).map(l => [l, now]),
    );
    this.translationHealthCache = null;
    return this.postModel.create({
      ...dto,
      ...localizedSlugs,
      slug,
      excerpt,
      language: dto.language || DEFAULT_BLOG_LANGUAGE,
      publishedAt,
      sourceUpdatedAt: now,
      translationsUpdatedAt,
    });
  }

  async update(id: string, dto: UpdatePostDto): Promise<PostDocument> {
    const existing = await this.postModel.findById(id).exec();
    if (!existing) throw new NotFoundException(`Post #${id} not found`);

    const update: any = { ...dto };

    if (dto.slug || dto.title) {
      update.slug = await this.ensureUniqueSlug(dto.slug || dto.title, id);
    }

    await this.fillLocalizedSlugs(update, existing.toObject(), id);
    Object.assign(update, translationTimestamps(dto as unknown as Record<string, unknown>, existing.toObject() as unknown as Record<string, unknown>, new Date()));

    // Publishing stamps the date once; going back to draft keeps it (and viewCount,
    // which is never part of the update) so re-publishing restores the article as it was.
    if (dto.published) {
      update.publishedAt = existing.publishedAt || new Date();
    }

    const post = await this.postModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!post) throw new NotFoundException(`Post #${id} not found`);
    this.translationHealthCache = null;
    return post;
  }

  async remove(id: string): Promise<void> {
    const result = await this.postModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Post #${id} not found`);
    this.translationHealthCache = null;
  }

  /** Admin: traduzioni mancanti, non aggiornate o con struttura diversa dall'italiano. */
  async getTranslationHealth(now = Date.now()): Promise<TranslationHealthSummary> {
    if (this.translationHealthCache && now - this.translationHealthCache.at < TRANSLATION_HEALTH_TTL_MS) {
      return this.translationHealthCache.value;
    }
    // Un post alla volta (cursore) tenendo solo l'esito: il corpo in 7 lingue
    // pesa ~66 KB a post e il server ha poca RAM.
    const analyzed: PostTranslationHealth[] = [];
    const cursor = this.postModel.find({}, TRANSLATION_HEALTH_FIELDS).lean().cursor();
    for await (const doc of cursor) analyzed.push(toPostHealth(doc as unknown as PostForHealth));
    const value = summarizeAnalyzed(analyzed);
    this.translationHealthCache = { at: now, value };
    return value;
  }

  /** Public: increment view count atomically. Fire-and-forget safe. */
  incrementViewCount(slug: string): Promise<void> {
    return this.postModel
      .updateOne({ ...anySlug(slug), published: true }, { $inc: { viewCount: 1 } })
      .exec()
      .then(() => undefined);
  }

  /** Admin: articoli più letti, solo i campi che la dashboard mostra (prima scaricava tutti i post per ordinarli lato client). */
  async getTopPostsByViews(limit = 5): Promise<Array<{ _id: unknown; title: string; slug: string; viewCount: number }>> {
    return this.postModel
      .find({}, { title: 1, slug: 1, viewCount: 1 })
      .sort({ viewCount: -1 })
      .limit(limit)
      .lean<Array<{ _id: unknown; title: string; slug: string; viewCount: number }>>()
      .exec();
  }

  async getContentSummary(): Promise<ContentSummary> {
    const [total, published] = await Promise.all([
      this.postModel.countDocuments().exec(),
      this.postModel.countDocuments({ published: true }).exec(),
    ]);

    return {
      total,
      published,
      drafts: Math.max(total - published, 0),
    };
  }
}
