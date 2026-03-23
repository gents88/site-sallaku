import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { DEFAULT_BLOG_LANGUAGE } from './blog.constants';

interface ContentSummary {
  total: number;
  published: number;
  drafts: number;
}

@Injectable()
export class BlogService {
  constructor(@InjectModel(Post.name) private postModel: Model<PostDocument>) {}

  private async ensureUniqueSlug(source: string, excludeId?: string): Promise<string> {
    const baseSlug = slugify(source, { lower: true, strict: true }) || `post-${Date.now()}`;
    let candidate = baseSlug;
    let index = 2;

    while (await this.postModel.exists({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
      candidate = `${baseSlug}-${index}`;
      index += 1;
    }

    return candidate;
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
        .select('-content')
        .lean()
        .exec() as unknown as Promise<PostDocument[]>,
      this.postModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page: Math.max(page, 1), totalPages: Math.ceil(total / safeLimit) };
  }

  /** Public: single post by slug */
  async findBySlug(slug: string): Promise<PostDocument> {
    const post = await this.postModel.findOne({ slug, published: true }).exec();
    if (!post) throw new NotFoundException(`Post "${slug}" not found`);
    return post;
  }

  /** Admin: all posts */
  findAll(): Promise<PostDocument[]> {
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
    return this.postModel.create({
      ...dto,
      slug,
      language: dto.language || DEFAULT_BLOG_LANGUAGE,
      publishedAt,
    });
  }

  async update(id: string, dto: UpdatePostDto): Promise<PostDocument> {
    const existing = await this.postModel.findById(id).exec();
    if (!existing) throw new NotFoundException(`Post #${id} not found`);

    const update: any = { ...dto };

    if (dto.slug || dto.title) {
      update.slug = await this.ensureUniqueSlug(dto.slug || dto.title, id);
    }

    if (dto.published !== undefined) {
      update.publishedAt = dto.published ? existing.publishedAt || new Date() : null;
    }

    const post = await this.postModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!post) throw new NotFoundException(`Post #${id} not found`);
    return post;
  }

  async remove(id: string): Promise<void> {
    const result = await this.postModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Post #${id} not found`);
  }

  /** Public: increment view count atomically. Fire-and-forget safe. */
  incrementViewCount(slug: string): Promise<void> {
    return this.postModel
      .updateOne({ slug, published: true }, { $inc: { viewCount: 1 } })
      .exec()
      .then(() => undefined);
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
