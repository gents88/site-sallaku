import { ConfigService } from '@nestjs/config';
import { BlogSchedulerService, postAnnouncementHtml } from './blog-scheduler.service';

const NOW = new Date('2026-10-17T10:00:00Z');
const config = { get: (_k: string, d: unknown) => d } as unknown as ConfigService;

function makeModel(due: Array<Record<string, unknown>>, modified = 1) {
  const updateExec = jest.fn().mockResolvedValue({ modifiedCount: modified });
  return {
    find: jest.fn((..._args: unknown[]) => ({
      lean: () => ({ exec: jest.fn().mockResolvedValue(due) }),
      sort: () => ({ limit: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(due) }) }) }),
    })),
    updateOne: jest.fn(() => ({ exec: updateExec })),
    updateExec,
  };
}

describe('BlogSchedulerService', () => {
  const at = new Date('2026-10-17T09:59:00Z');

  it('pubblica i post scaduti con un passaggio atomico e la data programmata come data di pubblicazione', async () => {
    const model = makeModel([{ _id: 'p1', title: 'T', slug: 't', scheduledAt: at, publishedAt: null }]);
    const ids = await new BlogSchedulerService(model as never, config).publishDue(NOW);

    expect(ids).toEqual(['p1']);
    expect(model.find.mock.calls[0][0]).toEqual({ published: false, scheduledAt: { $ne: null, $lte: NOW } });
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'p1', published: false, scheduledAt: at },
      { $set: { published: true, publishedAt: at, scheduledAt: null } },
    );
  });

  it('non annuncia due volte se un altro tick l’ha già pubblicato', async () => {
    const model = makeModel([{ _id: 'p1', title: 'T', slug: 't', scheduledAt: at, notifySubscribers: true }], 0);
    const campaigns = { create: jest.fn(), send: jest.fn() };
    const ids = await new BlogSchedulerService(model as never, config, campaigns as never).publishDue(NOW);
    expect(ids).toEqual([]);
    expect(campaigns.create).not.toHaveBeenCalled();
  });

  it('se richiesto crea e invia la campagna newsletter del post', async () => {
    const model = makeModel([{ _id: 'p1', title: 'Nuovo post', slug: 'nuovo-post', excerpt: 'Estratto', scheduledAt: at, notifySubscribers: true }]);
    const campaigns = { create: jest.fn().mockResolvedValue({ _id: 'c1' }), send: jest.fn().mockResolvedValue({}) };
    await new BlogSchedulerService(model as never, config, campaigns as never).publishDue(NOW);

    expect(campaigns.create).toHaveBeenCalledWith({ subject: 'Nuovo post', html: expect.stringContaining('https://gentsallaku.it/blog/nuovo-post') });
    expect(campaigns.send).toHaveBeenCalledWith('c1');
  });

  it('un errore della newsletter (es. nessun iscritto) non annulla la pubblicazione', async () => {
    const model = makeModel([{ _id: 'p1', title: 'T', slug: 't', scheduledAt: at, notifySubscribers: true }]);
    const campaigns = { create: jest.fn().mockResolvedValue({ _id: 'c1' }), send: jest.fn().mockRejectedValue(new Error('No confirmed subscribers')) };
    await expect(new BlogSchedulerService(model as never, config, campaigns as never).publishDue(NOW)).resolves.toEqual(['p1']);
  });

  it('tick non si sovrappone a sé stesso', async () => {
    const model = makeModel([]);
    const service = new BlogSchedulerService(model as never, config);
    await Promise.all([service.tick(), service.tick()]);
    expect(model.find).toHaveBeenCalledTimes(1);
  });
});

describe('postAnnouncementHtml', () => {
  it('fa l’escape di titolo ed estratto', () => {
    const html = postAnnouncementHtml({ title: '<script>x</script>', excerpt: 'a & b', slug: 's' }, 'https://example.com/');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).toContain('https://example.com/blog/s');
  });
});
