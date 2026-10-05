import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BATCH_SIZE, MAX_ATTEMPTS, NewsletterCampaignsService } from './newsletter-campaigns.service';

/** Documento finto con save()/deleteOne() come Mongoose. */
function doc<T extends object>(data: T, store: Array<Record<string, unknown>>) {
  const d = { ...data } as Record<string, unknown>;
  d.save = jest.fn(async () => d);
  d.deleteOne = jest.fn(async () => store.splice(store.indexOf(d), 1));
  store.push(d);
  return d as T & { save: jest.Mock; deleteOne: jest.Mock; _id: Types.ObjectId };
}

function setup(opts: { subscribers?: number; mailOk?: (to: string) => boolean } = {}) {
  const campaignsStore: Array<Record<string, unknown>> = [];
  const deliveriesStore: Array<Record<string, unknown>> = [];
  const subs = Array.from({ length: opts.subscribers ?? 3 }, (_, i) => ({
    _id: new Types.ObjectId(), email: `s${i}@x.it`, unsubscribeToken: `tok${i}`,
  }));
  const q = <T>(v: T) => ({ lean: () => ({ exec: async () => v }), exec: async () => v, sort: () => ({ limit: () => ({ lean: () => ({ exec: async () => v }) }) }) });

  const campaigns = {
    create: jest.fn(async (data: object) => doc({ _id: new Types.ObjectId(), status: 'draft', stats: { total: 0, sent: 0, failed: 0 }, ...data }, campaignsStore)),
    findById: jest.fn((id: string) => q(campaignsStore.find((c) => String(c._id) === String(id)) ?? null)),
    find: jest.fn((filter: { status?: string }) => q(campaignsStore.filter((c) => !filter?.status || c.status === filter.status))),
    updateMany: jest.fn((filter: { status: string; scheduledAt: { $lte: Date } }, update: { $set: { status: string } }) => ({
      exec: async () => {
        for (const c of campaignsStore) {
          if (c.status === filter.status && (c.scheduledAt as Date) <= filter.scheduledAt.$lte) c.status = update.$set.status;
        }
      },
    })),
  };
  const deliveries = {
    insertMany: jest.fn(async (rows: object[]) => rows.map((r) => doc({ _id: new Types.ObjectId(), status: 'pending', attempts: 0, lockedUntil: null, ...r }, deliveriesStore))),
    findOneAndUpdate: jest.fn((filter: { campaignId: unknown; status: string }, update: { $set: { lockedUntil: Date } }) => ({
      exec: async () => {
        const now = update.$set.lockedUntil.getTime() - 2 * 60_000;
        const d = deliveriesStore.find((x) => String(x.campaignId) === String(filter.campaignId) && x.status === 'pending'
          && (!x.lockedUntil || (x.lockedUntil as Date).getTime() <= now));
        if (!d) return null;
        d.lockedUntil = update.$set.lockedUntil;
        d.attempts = (d.attempts as number) + 1;
        return d;
      },
    })),
    countDocuments: jest.fn((f: { campaignId: unknown; status: string }) => ({
      exec: async () => deliveriesStore.filter((d) => String(d.campaignId) === String(f.campaignId) && d.status === f.status).length,
    })),
  };
  const subscribers = { find: jest.fn(() => ({ lean: () => ({ exec: async () => subs }) })) };
  const mail = { send: jest.fn(async ({ to }: { to: string }) => ({ success: opts.mailOk ? opts.mailOk(to) : true, accepted: [], rejected: [] })) };
  const config = { get: jest.fn((_k: string, def: string) => def) };
  const service = new NewsletterCampaignsService(campaigns as never, deliveries as never, subscribers as never, mail as never, config as never);
  return { service, campaignsStore, deliveriesStore, mail, subs };
}

describe('NewsletterCampaignsService', () => {
  it('sanitizes the body: no scripts, keeps formatting and links', async () => {
    const { service } = setup();
    const c = await service.create({ subject: ' Novità ', html: '<h1>Ciao</h1><script>alert(1)</script><a href="https://x.it" onclick="x()">link</a>' });
    expect(c.subject).toBe('Novità');
    expect(c.html).toContain('<h1>Ciao</h1>');
    expect(c.html).not.toMatch(/script|onclick/);
  });

  it('queues one delivery per confirmed subscriber and schedules the campaign', async () => {
    const { service, deliveriesStore } = setup({ subscribers: 3 });
    const c = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    const queued = await service.send(String(c._id));
    expect(deliveriesStore).toHaveLength(3);
    expect(queued.status).toBe('scheduled');
    expect(queued.stats).toEqual({ total: 3, sent: 0, failed: 0 });
  });

  it('refuses to send with no confirmed subscribers, or to edit/send a non-draft', async () => {
    const empty = setup({ subscribers: 0 });
    const c = await empty.service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    await expect(empty.service.send(String(c._id))).rejects.toBeInstanceOf(BadRequestException);

    const { service } = setup();
    const c2 = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    await service.send(String(c2._id));
    await expect(service.send(String(c2._id))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(String(c2._id), { subject: 'x', html: '<p>yyyyyyyyyy</p>' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not start a scheduled campaign before its time, then delivers everything and completes', async () => {
    const { service, campaignsStore, mail } = setup({ subscribers: 3 });
    const c = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    const at = new Date(Date.now() + 60 * 60_000);
    await service.send(String(c._id), at.toISOString());

    await service.tick(new Date());
    expect(mail.send).not.toHaveBeenCalled();

    await service.tick(new Date(at.getTime() + 1000));
    expect(mail.send).toHaveBeenCalledTimes(3);
    const done = campaignsStore[0];
    expect(done.status).toBe('sent');
    expect(done.stats).toEqual({ total: 3, sent: 3, failed: 0 });
  });

  it('retries a failing address and marks it failed after MAX_ATTEMPTS, without blocking the others', async () => {
    const { service, campaignsStore, deliveriesStore } = setup({ subscribers: 2, mailOk: (to) => to !== 's1@x.it' });
    const c = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    await service.send(String(c._id));
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await service.tick(new Date(Date.now() + i * 3 * 60_000));
    const failed = deliveriesStore.find((d) => d.email === 's1@x.it')!;
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(MAX_ATTEMPTS);
    expect(campaignsStore[0].stats).toEqual({ total: 2, sent: 1, failed: 1 });
    expect(campaignsStore[0].status).toBe('sent');
  });

  it('sends at most BATCH_SIZE emails per tick', async () => {
    const { service, mail } = setup({ subscribers: BATCH_SIZE + 5 });
    const c = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    await service.send(String(c._id));
    await service.tick(new Date());
    expect(mail.send).toHaveBeenCalledTimes(BATCH_SIZE);
  });

  it('a cancelled campaign stops sending', async () => {
    const { service, mail } = setup({ subscribers: 3 });
    const c = await service.create({ subject: 'Ciao', html: '<p>Contenuto lungo</p>' });
    await service.send(String(c._id));
    await service.cancel(String(c._id));
    await service.tick(new Date());
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('renders a personal unsubscribe link and RFC 8058 one-click headers', () => {
    const { service } = setup();
    const mail = service.renderEmail({ subject: 'S', html: '<p>Body</p>' }, 'a@x.it', 'tok 1');
    expect(mail.html).toContain('/newsletter/unsubscribe?token=tok%201');
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/.+\/newsletter\/unsubscribe\?token=tok%201>$/);
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail.text).toContain('Body');
  });
});
