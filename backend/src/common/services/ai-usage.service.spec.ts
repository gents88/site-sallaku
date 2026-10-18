import { AiUsageService, MAX_CAPPED_IPS, utcDay } from './ai-usage.service';

function makeModel(docs: Array<Record<string, unknown>> = []) {
  const updateExec = jest.fn().mockResolvedValue({ acknowledged: true });
  return {
    updateOne: jest.fn(() => ({ exec: updateExec })),
    find: jest.fn(() => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(docs) }) })),
    findOne: jest.fn(() => ({ lean: () => ({ exec: jest.fn().mockResolvedValue(docs[0] ?? null) }) })),
    updateExec,
  };
}

const NOW = new Date('2026-10-17T12:00:00Z');

describe('AiUsageService', () => {
  it('conta la chiamata per giorno UTC e per strumento, con upsert', async () => {
    const model = makeModel();
    await new AiUsageService(model as never).recordCall('summarize-file', NOW);
    expect(model.updateOne).toHaveBeenCalledWith(
      { date: '2026-10-17' },
      { $inc: { calls: 1, 'byEndpoint.summarize-file': 1 } },
      { upsert: true },
    );
  });

  it('non permette chiavi Mongo pericolose nel nome dello strumento', async () => {
    const model = makeModel();
    await new AiUsageService(model as never).recordCall('$where.x', NOW);
    const inc = (model.updateOne.mock.calls[0] as unknown[])[1] as { $inc: Record<string, number> };
    expect(Object.keys(inc.$inc)).toContain('byEndpoint._where_x');
  });

  it('separa i token degli strumenti da quelli del chatbot e ignora gli zeri', async () => {
    const model = makeModel();
    const service = new AiUsageService(model as never);
    await service.recordTokens(0, 'tools', NOW);
    expect(model.updateOne).not.toHaveBeenCalled();
    await service.recordTokens(420, 'chatbot', NOW);
    expect(model.updateOne).toHaveBeenCalledWith(
      { date: '2026-10-17' },
      { $inc: { tokens: 420, 'tokensBySource.chatbot': 420 } },
      { upsert: true },
    );
  });

  it('registra l’IP bloccato solo come hash e con un tetto alla lista', async () => {
    const model = makeModel();
    await new AiUsageService(model as never).recordRejected('ipCap', 'abc123', NOW);
    expect(model.updateOne).toHaveBeenNthCalledWith(1, { date: '2026-10-17' }, { $inc: { rejectedIpCap: 1 } }, { upsert: true });
    expect(model.updateOne).toHaveBeenNthCalledWith(
      2,
      { date: '2026-10-17', [`cappedIps.${MAX_CAPPED_IPS - 1}`]: { $exists: false } },
      { $addToSet: { cappedIps: 'abc123' } },
    );
  });

  it('un errore di scrittura non fa fallire la richiesta AI', async () => {
    const model = makeModel();
    model.updateExec.mockRejectedValue(new Error('mongo giù'));
    await expect(new AiUsageService(model as never).recordCall('format-text', NOW)).resolves.toBeUndefined();
  });

  it('tokensToday restituisce null (non zero) se il DB non risponde', async () => {
    const model = makeModel();
    model.findOne.mockReturnValue({ lean: () => ({ exec: jest.fn().mockRejectedValue(new Error('x')) }) } as never);
    expect(await new AiUsageService(model as never).tokensToday(NOW)).toBeNull();
  });

  it('il riepilogo ha oggi in dettaglio e lo storico con gli zeri nei giorni vuoti', async () => {
    const model = makeModel([
      {
        date: '2026-10-17', tokens: 1200, calls: 9,
        byEndpoint: { 'format-text': 2, 'summarize-file': 7 },
        tokensBySource: { tools: 1000, chatbot: 200 },
        rejectedIpCap: 3, rejectedBudget: 0, cappedIps: ['a', 'b'],
      },
      { date: '2026-10-15', tokens: 50, calls: 1 },
    ]);
    const s = await new AiUsageService(model as never).getSummary(3, NOW);

    expect(s.date).toBe('2026-10-17');
    expect(s.tokens).toBe(1200);
    expect(s.byEndpoint).toEqual([{ endpoint: 'summarize-file', calls: 7 }, { endpoint: 'format-text', calls: 2 }]);
    expect(s.tokensBySource).toEqual({ tools: 1000, chatbot: 200 });
    expect(s.cappedIps).toBe(2);
    expect(s.history).toEqual([
      { date: '2026-10-15', tokens: 50, calls: 1 },
      { date: '2026-10-16', tokens: 0, calls: 0 },
      { date: '2026-10-17', tokens: 1200, calls: 9 },
    ]);
  });

  it('utcDay usa il giorno UTC, non quello locale', () => {
    expect(utcDay(new Date('2026-10-17T23:30:00-02:00'))).toBe('2026-10-18');
  });
});
