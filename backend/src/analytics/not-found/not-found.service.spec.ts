import { NotFoundException } from '@nestjs/common';
import { MAX_DISTINCT_PATHS, NotFoundService, normalizeNotFoundPath, sanitizeReferrer } from './not-found.service';

function makeModel(opts: { matched?: number; total?: number; docs?: unknown[] } = {}) {
  const updateExec = jest.fn().mockResolvedValue({ matchedCount: opts.matched ?? 0 });
  return {
    updateOne: jest.fn((..._a: unknown[]) => ({ exec: updateExec })),
    estimatedDocumentCount: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(opts.total ?? 0) })),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(2) })),
    find: jest.fn((..._a: unknown[]) => ({ sort: () => ({ limit: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(opts.docs ?? []) }) }) }) })),
    updateExec,
  };
}

const NOW = new Date('2026-10-17T10:00:00Z');

describe('normalizeNotFoundPath / sanitizeReferrer', () => {
  it('tiene solo il percorso, senza query, frammento e slash finale', () => {
    expect(normalizeNotFoundPath('/en/blog/vecchio-slug/?utm_source=x#top')).toBe('/en/blog/vecchio-slug');
    expect(normalizeNotFoundPath('/a//b')).toBe('/a/b');
    expect(normalizeNotFoundPath('/')).toBe('/');
  });

  it('rifiuta percorsi non interni o enormi', () => {
    expect(normalizeNotFoundPath('https://evil.example/x')).toBeNull();
    expect(normalizeNotFoundPath('//evil.example/x')).toBeNull();
    expect(normalizeNotFoundPath('/' + 'a'.repeat(400))).toBeNull();
  });

  it('dal referrer toglie la query string (può contenere dati personali)', () => {
    expect(sanitizeReferrer('https://www.google.com/search?q=gent+sallaku')).toBe('https://www.google.com/search');
    expect(sanitizeReferrer('javascript:alert(1)')).toBe('');
    expect(sanitizeReferrer('non un url')).toBe('');
  });
});

describe('NotFoundService', () => {
  it('incrementa un percorso già noto e lo riapre se era stato ignorato', async () => {
    const model = makeModel({ matched: 1 });
    await new NotFoundService(model as never).record({ path: '/blog/vecchio?x=1', kind: 'blog', referrer: 'https://t.co/abc?s=1' }, NOW);
    expect(model.updateOne).toHaveBeenCalledTimes(1);
    expect(model.updateOne.mock.calls[0]).toEqual([
      { path: '/blog/vecchio' },
      { $inc: { count: 1 }, $set: { lastSeenAt: NOW, lastReferrer: 'https://t.co/abc', dismissedAt: null, kind: 'blog' } },
    ]);
  });

  it('crea un percorso nuovo con upsert finché non si supera il tetto', async () => {
    const model = makeModel({ matched: 0, total: 10 });
    await new NotFoundService(model as never).record({ path: '/nuovo' }, NOW);
    const [, update, opts] = model.updateOne.mock.calls[1] as unknown as [unknown, Record<string, unknown>, unknown];
    expect(update.$setOnInsert).toEqual({ firstSeenAt: NOW });
    expect(opts).toEqual({ upsert: true });
  });

  it('oltre il tetto non crea percorsi nuovi (difesa da spam)', async () => {
    const model = makeModel({ matched: 0, total: MAX_DISTINCT_PATHS });
    const res = await new NotFoundService(model as never).record({ path: '/spam-123' }, NOW);
    expect(res.success).toBe(false);
    expect(model.updateOne).toHaveBeenCalledTimes(1);
  });

  it('un tipo sconosciuto diventa "route" e un percorso non valido non scrive nulla', async () => {
    const model = makeModel({ matched: 1 });
    const service = new NotFoundService(model as never);
    await service.record({ path: '/x', kind: 'altro' }, NOW);
    expect((model.updateOne.mock.calls[0][1] as { $set: { kind: string } }).$set.kind).toBe('route');
    await expect(service.record({ path: 'http://x' })).resolves.toEqual({ success: false });
    expect(model.updateOne).toHaveBeenCalledTimes(1);
  });

  it('il riepilogo conta gli aperti e restituisce i più visti', async () => {
    const model = makeModel({ docs: [{ _id: 'a', path: '/x', kind: 'route', count: 5, firstSeenAt: NOW, lastSeenAt: NOW, lastReferrer: '' }] });
    const s = await new NotFoundService(model as never).summary(10);
    expect(s.open).toBe(2);
    expect(s.top[0]).toEqual(expect.objectContaining({ _id: 'a', count: 5 }));
    expect(model.find.mock.calls[0][0]).toEqual({ dismissedAt: null });
  });

  it('dismiss dà 404 su un id che non esiste', async () => {
    const model = makeModel({ matched: 0 });
    await expect(new NotFoundService(model as never).dismiss('507f1f77bcf86cd799439011')).rejects.toBeInstanceOf(NotFoundException);
  });
});
