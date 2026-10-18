import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { BlogService, translationTimestamps } from './blog.service';
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

    it('should exclude the article body in every language from the list', async () => {
      const chain = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
      Object.keys(chain).forEach(k => { if (k !== 'exec') (chain as any)[k].mockReturnValue(chain); });
      modelMock.find.mockReturnValue(chain);
      modelMock.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await service.findPublished(undefined, 1, 10);

      const excluded = (chain.select.mock.calls[0][0] as string).split(' ');
      for (const field of ['content', 'content_en', 'content_sq', 'content_pt', 'content_es', 'content_fr', 'content_de']) {
        expect(excluded).toContain(`-${field}`);
      }
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
    it('keeps publishedAt and never touches viewCount when moving a post back to draft', async () => {
      const publishedAt = new Date('2025-01-01');
      const existing = { ...makePost({ published: true, publishedAt, viewCount: 42 }), toObject() { return this; } };
      modelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });
      modelMock.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      await service.update('1', { published: false } as any);

      const update = modelMock.findByIdAndUpdate.mock.calls[0][1];
      expect(update.published).toBe(false);
      expect(update).not.toHaveProperty('publishedAt');
      expect(update).not.toHaveProperty('viewCount');
    });

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

  // ── controllo traduzioni ────────────────────────────────────────────────────

  describe('date delle traduzioni', () => {
    function existingPost(extra: Record<string, unknown> = {}) {
      return { ...makePost({ title: 'Titolo', content: 'Contenuto italiano' }), title_en: 'Title', content_en: 'English', ...extra, toObject() { return this; } };
    }

    it('modificare il testo italiano aggiorna sourceUpdatedAt, non le traduzioni', async () => {
      modelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingPost()) });
      modelMock.exists.mockResolvedValue(null);
      modelMock.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingPost()) });

      await service.update('1', { title: 'Titolo', content: 'Contenuto italiano rivisto', title_en: 'Title', content_en: 'English' } as any);

      const update = modelMock.findByIdAndUpdate.mock.calls[0][1];
      expect(update.sourceUpdatedAt).toBeInstanceOf(Date);
      expect(update).not.toHaveProperty('translationsUpdatedAt.en');
    });

    it('un autosave identico a quanto salvato non tocca nessuna data', async () => {
      modelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingPost()) });
      modelMock.exists.mockResolvedValue(null);
      modelMock.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(existingPost()) });

      await service.update('1', { title: 'Titolo', content: 'Contenuto italiano', content_en: 'English', published: false } as any);

      const update = modelMock.findByIdAndUpdate.mock.calls[0][1];
      expect(update).not.toHaveProperty('sourceUpdatedAt');
      expect(Object.keys(update).some((k) => k.startsWith('translationsUpdatedAt'))).toBe(false);
    });

    it('cambiare una traduzione aggiorna solo la sua data', () => {
      const now = new Date('2026-10-17T10:00:00Z');
      expect(translationTimestamps({ content_sq: 'nuovo' }, { content_sq: 'vecchio' }, now)).toEqual({ 'translationsUpdatedAt.sq': now });
    });

    it('getTranslationHealth legge i post con un cursore e tiene il risultato in cache', async () => {
      const docs = [{ _id: 'p1', title: 'T', slug: 't', published: true, content: '<p>x</p>' }];
      const cursor = jest.fn(() => (async function* () { yield* docs; })());
      modelMock.find.mockReturnValue({ lean: () => ({ cursor }) });

      const first = await service.getTranslationHealth(1_000);
      expect(first.posts).toBe(1);
      expect(first.missing).toBe(6);
      await service.getTranslationHealth(2_000);
      expect(cursor).toHaveBeenCalledTimes(1);
    });
  });

  // ── pubblicazione programmata ───────────────────────────────────────────────

  describe('programmazione', () => {
    function existing(published: boolean) {
      return { ...makePost({ published }), toObject() { return this; } };
    }
    function mockUpdate(post: unknown) {
      modelMock.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(post) });
      modelMock.exists.mockResolvedValue(null);
      modelMock.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(post) });
    }

    it('una bozza con scheduledAt viene programmata', async () => {
      mockUpdate(existing(false));
      await service.update('1', { published: false, scheduledAt: '2026-10-20T08:00:00.000Z' } as any);
      expect(modelMock.findByIdAndUpdate.mock.calls[0][1].scheduledAt).toEqual(new Date('2026-10-20T08:00:00.000Z'));
    });

    it('null toglie la programmazione', async () => {
      mockUpdate(existing(false));
      await service.update('1', { scheduledAt: null } as any);
      expect(modelMock.findByIdAndUpdate.mock.calls[0][1].scheduledAt).toBeNull();
    });

    it('un post già pubblicato (es. dallo scheduler) non torna programmato con un autosave', async () => {
      mockUpdate(existing(true));
      await service.update('1', { title: 'Test Post', scheduledAt: '2026-10-20T08:00:00.000Z' } as any);
      const update = modelMock.findByIdAndUpdate.mock.calls[0][1];
      expect(update.scheduledAt).toBeNull();
      expect(update).not.toHaveProperty('published');
    });

    it('pubblicare subito cancella la programmazione', async () => {
      mockUpdate(existing(false));
      await service.update('1', { published: true, scheduledAt: '2026-10-20T08:00:00.000Z' } as any);
      expect(modelMock.findByIdAndUpdate.mock.calls[0][1].scheduledAt).toBeNull();
    });

    it('create: scheduledAt vale solo per le bozze', async () => {
      modelMock.exists.mockResolvedValue(null);
      modelMock.create.mockResolvedValue({});
      await service.create({ title: 'Nuovo post', content: 'Contenuto abbastanza lungo', published: false, scheduledAt: '2026-10-20T08:00:00.000Z' } as any);
      await service.create({ title: 'Altro post', content: 'Contenuto abbastanza lungo', published: true, scheduledAt: '2026-10-20T08:00:00.000Z' } as any);
      expect(modelMock.create.mock.calls[0][0].scheduledAt).toEqual(new Date('2026-10-20T08:00:00.000Z'));
      expect(modelMock.create.mock.calls[1][0].scheduledAt).toBeNull();
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
