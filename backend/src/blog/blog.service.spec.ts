import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { BlogService } from './blog.service';
import { Post } from './schemas/post.schema';

const anySlugFilter = (slug: string) => ({
  $or: ['slug', 'slug_en', 'slug_sq', 'slug_pt', 'slug_es', 'slug_fr', 'slug_de'].map(f => ({ [f]: slug })),
});

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makePost(overrides: Partial<{
  _id: string; title: string; slug: string; content: string;
  published: boolean; publishedAt: Date | null; viewCount: number;
}> = {}) {
  return {
    _id: 'post-id-1',
    title: 'Test Post',
    slug: 'test-post',
    content: 'Post content here.',
    excerpt: '',
    tags: [],
    published: true,
    publishedAt: new Date('2025-01-01'),
    viewCount: 0,
    language: 'it',
    ...overrides,
  };
}

// Chainable Mongoose mock
function makeMockChain(result: unknown) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['find', 'findById', 'findOne', 'findByIdAndUpdate', 'findByIdAndDelete',
    'sort', 'skip', 'limit', 'select', 'lean', 'exec', 'countDocuments', 'exists',
    'create', 'updateOne', 'deleteOne'];

  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['exec'] = jest.fn().mockResolvedValue(result);
  chain['lean'] = jest.fn().mockReturnValue(chain);
  return chain;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('BlogService', () => {
  let service: BlogService;
  let modelMock: jest.Mocked<any>;

  beforeEach(async () => {
    modelMock = {
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      exists: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlogService,
        { provide: getModelToken(Post.name), useValue: modelMock },
      ],
    }).compile();

    service = module.get<BlogService>(BlogService);
  });

  // ── findPublished ───────────────────────────────────────────────────────────

  describe('findPublished', () => {
    it('should return paginated published posts', async () => {
      const posts = [makePost()];
      // Mock .find() chain
      const chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(), exec: jest.fn() };
      chain.sort.mockReturnValue(chain);
      chain.skip.mockReturnValue(chain);
      chain.limit.mockReturnValue(chain);
      chain.select.mockReturnValue(chain);
      chain.lean.mockReturnValue(chain);
      chain.exec.mockResolvedValue(posts);
      modelMock.find.mockReturnValue(chain);

      const countChain = { exec: jest.fn().mockResolvedValue(1) };
      modelMock.countDocuments.mockReturnValue(countChain);

      const result = await service.findPublished(undefined, 1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(modelMock.find).toHaveBeenCalledWith({ published: true });
    });

    it('should filter by tag when provided', async () => {
      const chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
      Object.keys(chain).forEach(k => { if (k !== 'exec') (chain as any)[k].mockReturnValue(chain); });
      modelMock.find.mockReturnValue(chain);
      modelMock.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await service.findPublished('angular', 1, 10);

      expect(modelMock.find).toHaveBeenCalledWith({ published: true, tags: 'angular' });
    });

    it('should clamp limit to max 50', async () => {
      const chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
      Object.keys(chain).forEach(k => { if (k !== 'exec') (chain as any)[k].mockReturnValue(chain); });
      modelMock.find.mockReturnValue(chain);
      modelMock.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await service.findPublished(undefined, 1, 999);

      expect(chain.limit).toHaveBeenCalledWith(50);
    });
  });

  // ── findBySlug ──────────────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('should return the post when found', async () => {
      const post = makePost();
      const chain = { exec: jest.fn().mockResolvedValue(post) };
      modelMock.findOne.mockReturnValue(chain);

      const result = await service.findBySlug('test-post');

      expect(result).toEqual(post);
      expect(modelMock.findOne).toHaveBeenCalledWith({ ...anySlugFilter('test-post'), published: true });
    });

    it('should match a per-language slug too (e.g. /sq/blog/<albanian-slug>)', async () => {
      modelMock.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(makePost()) });

      await service.findBySlug('blinishti-historia');

      const filter = modelMock.findOne.mock.calls[0][0];
      expect(filter.$or).toContainEqual({ slug_sq: 'blinishti-historia' });
      expect(filter.$or).toContainEqual({ slug: 'blinishti-historia' });
    });

    it('should throw NotFoundException if post not found', async () => {
      modelMock.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.findBySlug('missing-slug')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a post with a unique slug', async () => {
      const post = makePost();
      modelMock.exists.mockResolvedValue(null); // slug is unique
      modelMock.create.mockResolvedValue(post);

      const result = await service.create({
        title: 'Test Post',
        content: 'Content here',
        published: false,
      } as any);

      expect(modelMock.create).toHaveBeenCalled();
      expect(result.slug).toBe('test-post');
    });

    it('should generate a per-language slug from each translated title (diacritics stripped)', async () => {
      modelMock.exists.mockResolvedValue(null);
      modelMock.create.mockResolvedValue(makePost());

      await service.create({
        title: 'Blinisht: storia e memoria',
        title_sq: 'Blinishti: historia dhe kujtesa e një territori',
        title_en: 'Blinisht: history and memory',
        content: 'Content here',
      } as any);

      const created = modelMock.create.mock.calls[0][0];
      expect(created.slug).toBe('blinisht-storia-e-memoria');
      expect(created.slug_sq).toBe('blinishti-historia-dhe-kujtesa-e-nje-territori');
      expect(created.slug_en).toBe('blinisht-history-and-memory');
      expect(created.slug_de).toBeUndefined(); // no German title → no German slug
    });

    it('should set publishedAt when publishing', async () => {
      const now = new Date();
      const post = makePost({ published: true, publishedAt: now });
      modelMock.exists.mockResolvedValue(null);
      modelMock.create.mockResolvedValue(post);

      const result = await service.create({
        title: 'Test Post',
        content: 'Content',
        published: true,
      } as any);

      expect(result.publishedAt).toBeTruthy();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('never regenerates a per-language slug that already exists', async () => {
      const existing = { ...makePost(), title_sq: 'Titull i vjetër', slug_sq: 'titull-i-vjeter', toObject() { return this; } };
      modelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });
      modelMock.exists.mockResolvedValue(null);
      modelMock.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      await service.update('post-id-1', { title: 'Test Post', title_sq: 'Titull i ri' } as any);

      const update = modelMock.findByIdAndUpdate.mock.calls[0][1];
      expect(update.slug_sq).toBeUndefined();
    });
  });

  // ── backfillLocalizedSlugs ──────────────────────────────────────────────────

  describe('backfillLocalizedSlugs', () => {
    it('fills only the missing slugs of existing posts', async () => {
      const post = { _id: 'p1', slug: 'blinisht', title_sq: 'Blinishti sot', slug_en: 'kept', title_en: 'Kept' };
      modelMock.find.mockReturnValue(makeMockChain([post]));
      modelMock.exists.mockResolvedValue(null);
      modelMock.updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });

      await expect(service.backfillLocalizedSlugs()).resolves.toBe(1);
      expect(modelMock.updateOne).toHaveBeenCalledWith({ _id: 'p1' }, { $set: { slug_sq: 'blinishti-sot' } });
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete a post by id', async () => {
      modelMock.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(makePost()) });

      await expect(service.remove('post-id-1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundException if post not found', async () => {
      modelMock.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
