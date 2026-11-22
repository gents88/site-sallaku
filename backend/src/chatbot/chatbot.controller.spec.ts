import { ChatbotController } from './chatbot.controller';

describe('ChatbotController — message/stream (SSE)', () => {
  function fakeRes() {
    const written: string[] = [];
    const handlers: Record<string, () => void> = {};
    return {
      written,
      headers: {} as Record<string, string>,
      writableEnded: false,
      status: jest.fn(),
      setHeader(k: string, v: string) { this.headers[k] = v; },
      flushHeaders: jest.fn(),
      flush: jest.fn(),
      on: (ev: string, cb: () => void) => { handlers[ev] = cb; },
      write(chunk: string) { written.push(chunk); },
      end() { this.writableEnded = true; },
      emit: (ev: string) => handlers[ev]?.(),
    };
  }
  const req = { ip: '1.2.3.4', headers: { 'user-agent': 'jest' } };

  it('invia un evento delta per ogni pezzo e un evento done con il risultato, poi chiude', async () => {
    const result = { sessionId: 's1', reply: 'Ciao', timestamp: new Date('2026-01-01'), suggestions: ['a?'] };
    const service = {
      sendMessageStream: jest.fn().mockImplementation(async (_m, _s, _meta, _l, onDelta: (t: string) => void) => {
        onDelta('Ci');
        onDelta('ao');
        return result;
      }),
    };
    const res = fakeRes();

    await new ChatbotController(service as any).sendMessageStream(req, res, { message: 'ciao', lang: 'it' } as any);

    expect(res.headers['Content-Type']).toContain('text/event-stream');
    expect(res.headers['X-Accel-Buffering']).toBe('no');
    expect(res.written).toEqual([
      'event: delta\ndata: {"t":"Ci"}\n\n',
      'event: delta\ndata: {"t":"ao"}\n\n',
      `event: done\ndata: ${JSON.stringify(result)}\n\n`,
    ]);
    expect(res.flush).toHaveBeenCalledTimes(3);
    expect(res.writableEnded).toBe(true);
    expect(service.sendMessageStream.mock.calls[0].slice(0, 4)).toEqual(['ciao', undefined, { ip: '1.2.3.4', userAgent: 'jest' }, 'it']);
  });

  it('un errore del servizio diventa un evento error e la risposta si chiude comunque', async () => {
    const service = { sendMessageStream: jest.fn().mockRejectedValue(new Error('boom')) };
    const res = fakeRes();

    await new ChatbotController(service as any).sendMessageStream(req, res, { message: 'x' } as any);

    expect(res.written).toEqual(['event: error\ndata: {"message":"boom"}\n\n']);
    expect(res.writableEnded).toBe(true);
  });

  it('se il visitatore chiude la connessione non scrive più', async () => {
    const res = fakeRes();
    const service = {
      sendMessageStream: jest.fn().mockImplementation(async (_m, _s, _meta, _l, onDelta: (t: string) => void) => {
        onDelta('uno');
        res.emit('close');
        onDelta('due');
        return { sessionId: 's', reply: 'uno due', timestamp: new Date() };
      }),
    };

    await new ChatbotController(service as any).sendMessageStream(req, res, { message: 'x' } as any);

    expect(res.written).toEqual(['event: delta\ndata: {"t":"uno"}\n\n']);
  });
});
