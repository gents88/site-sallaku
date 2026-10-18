import { NotFoundException } from '@nestjs/common';
import { ErrorLogService, errorFingerprint, normalizeRoute } from './error-log.service';

function makeModel(docs: Array<Record<string, unknown>> = [], open = 0) {
  const updateExec = jest.fn().mockResolvedValue({ matchedCount: 1 });
  return {
    updateOne: jest.fn(() => ({ exec: updateExec })),
    updateMany: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 4 }) })),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(open) })),
    find: jest.fn(() => ({
      sort: () => ({ limit: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(docs) }) }) }),
    })),
    updateExec,
  };
}

const NOW = new Date('2026-10-17T10:00:00Z');

describe('normalizeRoute', () => {
  it('sostituisce id, uuid, numeri e token con segnaposti e toglie la query', () => {
    expect(normalizeRoute('/api/v1/blog/posts/507f1f77bcf86cd799439011?x=1')).toBe('/api/v1/blog/posts/:id');
    expect(normalizeRoute('/api/v1/chatbot/123e4567-e89b-42d3-a456-426614174000/live-handoff')).toBe('/api/v1/chatbot/:uuid/live-handoff');
    expect(normalizeRoute('/api/v1/page/42')).toBe('/api/v1/page/:n');
    expect(normalizeRoute(`/api/v1/x/${'a'.repeat(50)}`)).toBe('/api/v1/x/:token');
    expect(normalizeRoute('/api/v1/blog/posts/come-funziona-rag')).toBe('/api/v1/blog/posts/come-funziona-rag');
  });
});

describe('errorFingerprint', () => {
  const base = { method: 'GET', url: '/api/v1/blog/posts/507f1f77bcf86cd799439011', status: 500, name: 'TypeError', message: 'x is undefined' };

  it('raggruppa la stessa eccezione su id diversi e con numeri diversi nel messaggio', () => {
    expect(errorFingerprint(base)).toBe(errorFingerprint({ ...base, url: '/api/v1/blog/posts/507f191e810c19729de860ea' }));
    expect(errorFingerprint({ ...base, message: 'timeout after 3000ms' })).toBe(errorFingerprint({ ...base, message: 'timeout after 5000ms' }));
  });

  it('separa rotte, metodi e messaggi diversi', () => {
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, method: 'POST' }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, message: 'altro' }));
    expect(errorFingerprint(base)).not.toBe(errorFingerprint({ ...base, url: '/api/v1/search' }));
  });
});

describe('ErrorLogService', () => {
  it('fa upsert del gruppo, conta il giorno e riapre un gruppo risolto', async () => {
    const model = makeModel();
    await new ErrorLogService(model as never).record(
      { method: 'get', url: '/api/v1/search?q=a', status: 500, name: 'MongoServerError', message: 'text index required', stack: 's', requestId: 'r1' },
      NOW,
    );
    const [filter, update, opts] = model.updateOne.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, Record<string, unknown>>, unknown];
    expect(filter).toEqual({ fingerprint: expect.any(String) });
    expect(update.$inc).toEqual({ count: 1, 'days.2026-10-17': 1 });
    expect(update.$set).toEqual(expect.objectContaining({ path: '/api/v1/search', resolvedAt: null, lastRequestId: 'r1' }));
    expect(update.$setOnInsert).toEqual(expect.objectContaining({ method: 'GET', route: '/api/v1/search', status: 500 }));
    expect(opts).toEqual({ upsert: true });
  });

  it('non lancia mai, anche se Mongo è giù', async () => {
    const model = makeModel();
    model.updateExec.mockRejectedValue(new Error('down'));
    await expect(new ErrorLogService(model as never).record({ method: 'GET', url: '/', status: 500 }, NOW)).resolves.toBeUndefined();
  });

  it('in un loop di errori smette di scrivere dopo 30 occorrenze in 10 s', async () => {
    const model = makeModel();
    const service = new ErrorLogService(model as never);
    for (let i = 0; i < 40; i++) await service.record({ method: 'GET', url: '/', status: 500 }, new Date(NOW.getTime() + i));
    expect(model.updateOne).toHaveBeenCalledTimes(30);
    await service.record({ method: 'GET', url: '/', status: 500 }, new Date(NOW.getTime() + 11_000));
    expect(model.updateOne).toHaveBeenCalledTimes(31);
  });

  it('il riepilogo somma le occorrenze di oggi e della settimana e mostra solo i gruppi aperti', async () => {
    const model = makeModel(
      [
        { _id: 'a', method: 'GET', route: '/x', status: 500, count: 9, days: { '2026-10-17': 2, '2026-10-12': 5, '2026-10-01': 2 }, lastSeenAt: NOW, resolvedAt: null },
        { _id: 'b', method: 'POST', route: '/y', status: 502, count: 1, days: { '2026-10-16': 1 }, lastSeenAt: NOW, resolvedAt: NOW },
      ],
      1,
    );
    const s = await new ErrorLogService(model as never).summary(NOW);
    expect(s.open).toBe(1);
    expect(s.today).toBe(2);
    expect(s.week).toBe(8);
    expect(s.recent.map((r) => r._id)).toEqual(['a']);
    expect(s.recent[0].today).toBe(2);
  });

  it('resolve dà 404 su un id inesistente', async () => {
    const model = makeModel();
    model.updateExec.mockResolvedValue({ matchedCount: 0 });
    await expect(new ErrorLogService(model as never).resolve('507f1f77bcf86cd799439011')).rejects.toBeInstanceOf(NotFoundException);
  });
});
