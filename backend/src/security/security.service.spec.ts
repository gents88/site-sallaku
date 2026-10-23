import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { SUSPICIOUS_IP_THRESHOLD, SecurityService } from './security.service';
import { SecurityEvent } from './schemas/security-event.schema';
import { AuthSession } from './schemas/auth-session.schema';
import { User } from '../users/schemas/user.schema';

const ctx = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36' };
const uid = () => new Types.ObjectId().toString();

/** Query finta: .sort().limit().select().lean().exec() → rows. */
function query(rows: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'skip', 'limit', 'select', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(rows);
  return q;
}

async function setup(opts: { events?: any; sessions?: any; session?: any; indexes?: any[]; users?: any; counts?: number[]; ips?: any[] } = {}) {
  const counts = [...(opts.counts ?? [0, 0, 0])];
  const events = {
    create: jest.fn().mockResolvedValue({}),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(counts.shift() ?? 0) })),
    aggregate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(opts.ips ?? []) })),
    find: jest.fn(() => query(opts.events ?? [])),
  };
  const sessions = {
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) })),
    deleteOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
    deleteMany: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
    findOne: jest.fn(() => query(opts.session ?? null)),
    find: jest.fn(() => query(opts.sessions ?? [])),
    syncIndexes: jest.fn().mockResolvedValue([]),
    collection: { indexes: jest.fn().mockResolvedValue(opts.indexes ?? []), dropIndex: jest.fn().mockResolvedValue({}) },
  };
  const users = { find: jest.fn(() => query(opts.users ?? [])) };
  const mod = await Test.createTestingModule({
    providers: [
      SecurityService,
      { provide: getModelToken(SecurityEvent.name), useValue: events },
      { provide: getModelToken(AuthSession.name), useValue: sessions },
      { provide: getModelToken(User.name), useValue: users },
    ],
  }).compile();
  return { service: mod.get(SecurityService), events, sessions, users };
}

describe('SecurityService.record', () => {
  it('salva tipo, IP, dispositivo e identificativo mascherato', async () => {
    const { service, events } = await setup();
    const id = uid();
    await service.record('login_failed', ctx, { userId: id, identifier: 'Mario@X.it', detail: 'password errata' });
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'login_failed', ip: '203.0.113.7', identifier: 'mario@x.it', detail: 'password errata',
    }));
    expect(String((events.create.mock.calls as any)[0][0].userId)).toBe(id);
  });

  it('un userId non valido diventa null invece di rompere il salvataggio', async () => {
    const { service, events } = await setup();
    await service.record('otp_failed', ctx, { userId: 'non-un-id' });
    expect((events.create.mock.calls as any)[0][0].userId).toBeNull();
  });

  it('non lancia mai: se Mongo fallisce il login non ne risente', async () => {
    const { service, events } = await setup();
    events.create.mockRejectedValue(new Error('mongo giù'));
    await expect(service.record('login_failed', ctx)).resolves.toBeUndefined();
  });

  it('sotto un attacco distribuito limita le scritture in una finestra', async () => {
    const { service, events } = await setup();
    await Promise.all(Array.from({ length: 200 }, () => service.record('login_failed', ctx)));
    expect(events.create.mock.calls.length).toBe(60);
  });
});

describe('SecurityService sessioni (un dispositivo = una sessione)', () => {
  const uid2 = () => new Types.ObjectId().toString();

  it('createSession aggiunge una sessione con sid, hash, IP e dispositivo, senza toccare le altre', async () => {
    const { service, sessions } = await setup();
    const id = uid2();
    await service.createSession(id, 'sid-1', 'hash-1', ctx);
    const doc = (sessions.create.mock.calls as any)[0][0];
    expect(String(doc.userId)).toBe(id);
    expect(doc).toEqual(expect.objectContaining({ sid: 'sid-1', refreshTokenHash: 'hash-1', ip: ctx.ip, startedAt: expect.any(Date), lastSeenAt: expect.any(Date) }));
    expect(sessions.deleteOne).not.toHaveBeenCalled();
  });

  it('createSession propaga l’errore: un login non deve riuscire con un hash non salvato', async () => {
    const { service, sessions } = await setup();
    sessions.create.mockRejectedValue(new Error('mongo giù'));
    await expect(service.createSession(uid2(), 's', 'h', ctx)).rejects.toThrow('mongo giù');
  });

  it('oltre 10 dispositivi chiude i meno recenti', async () => {
    const stale = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
    const { service, sessions } = await setup({ sessions: stale });
    await service.createSession(uid2(), 'sid-11', 'h', ctx);
    expect(sessions.deleteMany).toHaveBeenCalledWith({ _id: { $in: stale.map((s) => s._id) } });
  });

  it('con meno di 10 dispositivi non cancella nulla', async () => {
    const { service, sessions } = await setup({ sessions: [] });
    await service.createSession(uid2(), 'sid-2', 'h', ctx);
    expect(sessions.deleteMany).not.toHaveBeenCalled();
  });

  it('findRefreshSession cerca per utente e sid con gli hash e ignora id non validi', async () => {
    const row = { refreshTokenHash: 'h', retiredRefreshHashes: [{ hash: 'p', retiredAt: new Date() }] };
    const { service, sessions } = await setup({ session: row });
    const id = uid2();
    await expect(service.findRefreshSession(id, 'sid-1')).resolves.toEqual(row);
    const [filter] = (sessions.findOne.mock.calls as any)[0];
    expect(String(filter.userId)).toBe(id);
    expect(filter.sid).toBe('sid-1');
    await expect(service.findRefreshSession('xx', 'sid-1')).resolves.toBeNull();
    expect(sessions.findOne).toHaveBeenCalledTimes(1);
  });

  it('rotateSession scambia l’hash solo se è ancora quello atteso e tiene il precedente', async () => {
    const { service, sessions } = await setup();
    const id = uid2();
    const ok = await service.rotateSession(id, 'sid-1', 'vecchio', 'nuovo', ctx);
    expect(ok).toBe(true);
    const [filter, update] = (sessions.updateOne.mock.calls as any)[0];
    expect(filter).toEqual(expect.objectContaining({ sid: 'sid-1', refreshTokenHash: 'vecchio' }));
    expect(update.$set).toEqual(expect.objectContaining({ refreshTokenHash: 'nuovo', lastSeenAt: expect.any(Date), ip: ctx.ip }));
    // il token sostituito si aggiunge all'elenco dei ritirati (non lo sovrascrive) e l'elenco resta corto
    expect(update.$push.retiredRefreshHashes.$each).toEqual([{ hash: 'vecchio', retiredAt: expect.any(Date) }]);
    expect(update.$push.retiredRefreshHashes.$slice).toBe(-6);
  });

  it('rotateSession restituisce false se un’altra richiesta ha già ruotato (nessuna riga corrisponde)', async () => {
    const { service, sessions } = await setup();
    sessions.updateOne.mockImplementation(() => ({ exec: jest.fn().mockResolvedValue({ matchedCount: 0 }) }));
    await expect(service.rotateSession(uid2(), 'sid-1', 'vecchio', 'nuovo', ctx)).resolves.toBe(false);
  });

  it('endSession cancella solo la sessione di quel sid e ignora id non validi', async () => {
    const { service, sessions } = await setup();
    const id = uid2();
    await service.endSession(id, 'sid-1');
    const [filter] = (sessions.deleteOne.mock.calls as any)[0];
    expect(String(filter.userId)).toBe(id);
    expect(filter.sid).toBe('sid-1');
    await service.endSession('xx', 'sid-1');
    expect(sessions.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('endAllSessions cancella tutte le sessioni dell’utente', async () => {
    const { service, sessions } = await setup();
    const id = uid2();
    await service.endAllSessions(id);
    const [filter] = (sessions.deleteMany.mock.calls as any)[0];
    expect(String(filter.userId)).toBe(id);
    expect(filter.sid).toBeUndefined();
    await service.endAllSessions('xx');
    expect(sessions.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('un errore nella chiusura non fa fallire logout o revoca', async () => {
    const { service, sessions } = await setup();
    sessions.deleteOne.mockImplementation(() => ({ exec: jest.fn().mockRejectedValue(new Error('x')) }));
    sessions.deleteMany.mockImplementation(() => ({ exec: jest.fn().mockRejectedValue(new Error('x')) }));
    await expect(service.endSession(uid2(), 's')).resolves.toBeUndefined();
    await expect(service.endAllSessions(uid2())).resolves.toBeUndefined();
  });
});

describe('SecurityService.onModuleInit (migrazione dell’indice)', () => {
  it('toglie l’indice univoco su userId, che impediva più dispositivi, e riallinea gli altri', async () => {
    const { service, sessions } = await setup({ indexes: [{ name: '_id_' }, { name: 'userId_1', unique: true }] });
    await service.onModuleInit();
    expect(sessions.collection.dropIndex).toHaveBeenCalledWith('userId_1');
    expect(sessions.syncIndexes).toHaveBeenCalled();
  });

  it('se l’indice su userId non è più univoco non lo tocca', async () => {
    const { service, sessions } = await setup({ indexes: [{ name: 'userId_1' }] });
    await service.onModuleInit();
    expect(sessions.collection.dropIndex).not.toHaveBeenCalled();
    expect(sessions.syncIndexes).toHaveBeenCalled();
  });

  it('un errore sugli indici non impedisce l’avvio', async () => {
    const { service, sessions } = await setup();
    sessions.collection.indexes.mockRejectedValue(new Error('non autorizzato'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

describe('SecurityService.summary', () => {
  const now = new Date('2026-10-22T12:00:00Z');

  it('conta gli eventi per tipo e finestra e segnala gli IP con troppi fallimenti', async () => {
    const { service, events } = await setup({
      counts: [7, 3, 1],
      ips: [{ _id: '198.51.100.9', failures: 6 }],
    });
    const s = await service.summary(now);
    expect([s.failedLogins24h, s.otpFailed24h, s.tokenReuse7d]).toEqual([7, 3, 1]);
    expect(s.suspiciousIps).toEqual([{ ip: '198.51.100.9', failures: 6 }]);
    // la soglia degli IP sospetti è nella pipeline, non filtrata a mano dopo
    const pipeline = (events.aggregate.mock.calls as any)[0][0];
    expect(JSON.stringify(pipeline)).toContain(`"failures":{"$gte":${SUSPICIOUS_IP_THRESHOLD}}`);
  });

  it('elenca una riga per dispositivo, anche per lo stesso utente, solo per sessioni con sid e utente esistente', async () => {
    const admin = uid();
    const orphan = uid();
    const t = new Date('2026-10-22T11:00:00Z');
    const { service, sessions } = await setup({
      sessions: [
        { sid: 'sid-pc', userId: new Types.ObjectId(admin), startedAt: t, lastSeenAt: t, ip: '203.0.113.7', userAgent: ctx.userAgent },
        { sid: 'sid-tel', userId: new Types.ObjectId(admin), startedAt: t, lastSeenAt: t, ip: '203.0.113.9', userAgent: '' },
        { sid: 'sid-x', userId: new Types.ObjectId(orphan), startedAt: t, lastSeenAt: t, ip: '203.0.113.8', userAgent: '' },
      ],
      users: [{ _id: new Types.ObjectId(admin), name: 'Gent', email: 'g@x.it', role: 'admin' }],
    });
    const s = await service.summary(now);
    expect(s.activeSessions).toBe(2);
    expect(s.sessions.map((x) => x.sessionId)).toEqual(['sid-pc', 'sid-tel']);
    expect(s.sessions[0]).toEqual(expect.objectContaining({ userId: admin, name: 'Gent', contact: 'g@x.it', device: 'Chrome su macOS', ip: '203.0.113.7' }));
    // le sessioni precedenti al multi-dispositivo (senza sid) non si mostrano
    expect(JSON.stringify((sessions.find.mock.calls as any)[0][0])).toContain('"sid":{"$type":"string"}');
  });

  it('un account senza email mostra il telefono come contatto', async () => {
    const id = uid();
    const t = new Date();
    const { service } = await setup({
      sessions: [{ sid: 's1', userId: new Types.ObjectId(id), startedAt: t, lastSeenAt: t, ip: '', userAgent: '' }],
      users: [{ _id: new Types.ObjectId(id), name: 'Anna', phone: '+393331234567', role: 'user' }],
    });
    expect((await service.summary(now)).sessions[0].contact).toBe('+393331234567');
  });

  it('descrive gli eventi recenti con il dispositivo ricavato dallo user agent', async () => {
    const { service } = await setup({
      events: [{ _id: new Types.ObjectId(), type: 'login_failed', ip: '203.0.113.7', userAgent: ctx.userAgent, identifier: 'a@x.it', detail: 'password errata', createdAt: new Date('2026-10-22T10:00:00Z') }],
    });
    const [e] = (await service.summary(now)).events;
    expect(e).toEqual(expect.objectContaining({ type: 'login_failed', device: 'Chrome su macOS', identifier: 'a@x.it', createdAt: '2026-10-22T10:00:00.000Z' }));
  });
});
