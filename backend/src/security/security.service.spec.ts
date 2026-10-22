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
  for (const m of ['sort', 'limit', 'select', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(rows);
  return q;
}

async function setup(opts: { events?: any; sessions?: any; users?: any; counts?: number[]; ips?: any[] } = {}) {
  const counts = [...(opts.counts ?? [0, 0, 0])];
  const events = {
    create: jest.fn().mockResolvedValue({}),
    countDocuments: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(counts.shift() ?? 0) })),
    aggregate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(opts.ips ?? []) })),
    find: jest.fn(() => query(opts.events ?? [])),
  };
  const sessions = {
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
    deleteOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
    find: jest.fn(() => query(opts.sessions ?? [])),
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

describe('SecurityService sessioni', () => {
  it('startSession riparte da adesso (sostituisce la sessione precedente)', async () => {
    const { service, sessions } = await setup();
    const id = uid();
    await service.startSession(id, ctx);
    const [filter, update, options] = (sessions.updateOne.mock.calls as any)[0];
    expect(String(filter.userId)).toBe(id);
    expect(update.$set).toEqual(expect.objectContaining({ ip: ctx.ip, startedAt: expect.any(Date), lastSeenAt: expect.any(Date) }));
    expect(options).toEqual({ upsert: true });
  });

  it('touchSession non sposta l’inizio: lo imposta solo se la sessione non esisteva', async () => {
    const { service, sessions } = await setup();
    await service.touchSession(uid(), ctx);
    const update = (sessions.updateOne.mock.calls as any)[0][1];
    expect(update.$set.startedAt).toBeUndefined();
    expect(update.$setOnInsert.startedAt).toBeInstanceOf(Date);
  });

  it('endSession cancella la sessione e ignora id non validi', async () => {
    const { service, sessions } = await setup();
    await service.endSession(uid());
    expect(sessions.deleteOne).toHaveBeenCalledTimes(1);
    await service.endSession('xx');
    expect(sessions.deleteOne).toHaveBeenCalledTimes(1);
  });

  it('un errore di scrittura sulla sessione non fa fallire l’accesso', async () => {
    const { service, sessions } = await setup();
    sessions.updateOne.mockImplementation(() => ({ exec: jest.fn().mockRejectedValue(new Error('x')) }));
    await expect(service.startSession(uid(), ctx)).resolves.toBeUndefined();
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

  it('mostra solo le sessioni il cui refresh token è ancora valido sull’utente', async () => {
    const live = uid();
    const revoked = uid();
    const t = new Date('2026-10-22T11:00:00Z');
    const { service, users } = await setup({
      sessions: [
        { userId: new Types.ObjectId(live), startedAt: t, lastSeenAt: t, ip: '203.0.113.7', userAgent: ctx.userAgent },
        { userId: new Types.ObjectId(revoked), startedAt: t, lastSeenAt: t, ip: '203.0.113.8', userAgent: '' },
      ],
      // il database restituisce solo gli utenti con refreshTokenHash non nullo
      users: [{ _id: new Types.ObjectId(live), name: 'Gent', email: 'g@x.it', role: 'admin' }],
    });
    const s = await service.summary(now);
    expect(s.activeSessions).toBe(1);
    expect(s.sessions).toEqual([expect.objectContaining({ userId: live, name: 'Gent', contact: 'g@x.it', device: 'Chrome su macOS', ip: '203.0.113.7' })]);
    expect(JSON.stringify((users.find.mock.calls as any)[0][0])).toContain('"refreshTokenHash":{"$ne":null}');
  });

  it('un account senza email mostra il telefono come contatto', async () => {
    const id = uid();
    const t = new Date();
    const { service } = await setup({
      sessions: [{ userId: new Types.ObjectId(id), startedAt: t, lastSeenAt: t, ip: '', userAgent: '' }],
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
