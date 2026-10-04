import { MongoSearchProvider } from './mongo-search.provider';

function model(results: { text?: unknown[]; regex?: unknown[] }) {
  const chain = (data: unknown[]) => {
    const q: Record<string, jest.Mock> = {};
    for (const m of ['sort', 'limit', 'select', 'lean']) q[m] = jest.fn(() => q);
    q.exec = jest.fn().mockResolvedValue(data);
    return q;
  };
  return {
    find: jest.fn((filter: Record<string, unknown>) => chain(filter.$text ? results.text ?? [] : results.regex ?? [])),
  };
}

const post = (title: string, score?: number) => ({ _id: title, title, excerpt: '', slug: title, tags: [], updatedAt: new Date(), score });

describe('MongoSearchProvider', () => {
  it('full search uses the text index and ranks by text score', async () => {
    const posts = model({ text: [post('A', 1), post('B', 5)] });
    const projects = model({});
    const provider = new MongoSearchProvider(posts as never, projects as never);
    const res = await provider.search({ q: 'angular', page: 1, limit: 10 });
    expect(posts.find.mock.calls[0][0]).toMatchObject({ published: true, $text: { $search: 'angular' } });
    expect(res.data.map(h => h.title)).toEqual(['B', 'A']);
  });

  it('falls back to the regex scan when the text index finds nothing (partial words)', async () => {
    const posts = model({ text: [], regex: [post('Angular')] });
    const provider = new MongoSearchProvider(posts as never, model({}) as never);
    const res = await provider.search({ q: 'angu', page: 1, limit: 10 });
    expect(posts.find).toHaveBeenCalledTimes(2);
    expect(res.data.map(h => h.title)).toEqual(['Angular']);
  });

  it('prefix mode (suggest) never touches the text index', async () => {
    const posts = model({ regex: [post('Angular')] });
    const provider = new MongoSearchProvider(posts as never, model({}) as never);
    await provider.search({ q: 'angular', page: 1, limit: 5, mode: 'prefix' });
    expect(posts.find.mock.calls.every(([f]) => !(f as Record<string, unknown>).$text)).toBe(true);
  });

  it('skips the text index for terms shorter than 3 characters', async () => {
    const posts = model({ regex: [] });
    await new MongoSearchProvider(posts as never, model({}) as never).search({ q: 'ng', page: 1, limit: 5 });
    expect(posts.find.mock.calls.every(([f]) => !(f as Record<string, unknown>).$text)).toBe(true);
  });

  it('links a project with a case study to its detail page, in the requested language', async () => {
    const projects = model({ text: [{ _id: 'p', title: 'Gestionale', description: 'd', slug: 'gest', problem: 'x', technologies: [], translations: { en: { title: 'Management' } }, score: 2 }] });
    const res = await new MongoSearchProvider(model({}) as never, projects as never).search({ q: 'management', lang: 'en', type: 'project', page: 1, limit: 5 });
    expect(res.data[0]).toMatchObject({ title: 'Management', url: '/projects/gest' });
  });
});
