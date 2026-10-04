import { Request, Response } from 'express';
import { NewsletterController } from './newsletter.controller';
import { NewsletterService } from './newsletter.service';

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.7',
    headers: {},
    socket: { remoteAddress: undefined },
    ...overrides,
  } as unknown as Request;
}

describe('NewsletterController', () => {
  let controller: NewsletterController;
  let service: jest.Mocked<
    Pick<NewsletterService, 'subscribe' | 'confirm' | 'unsubscribe' | 'findPaginated' | 'counts' | 'exportCsv' | 'remove'>
  >;

  beforeEach(() => {
    service = {
      subscribe: jest.fn().mockResolvedValue({ message: 'ok' }),
      confirm: jest.fn().mockResolvedValue({ email: 'a@b.com' }),
      unsubscribe: jest.fn().mockResolvedValue({ email: 'a@b.com' }),
      findPaginated: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }),
      counts: jest.fn().mockResolvedValue({ pending: 0, confirmed: 0, unsubscribed: 0, total: 0 }),
      exportCsv: jest.fn().mockResolvedValue('email,status\n'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    controller = new NewsletterController(service as unknown as NewsletterService);
  });

  it('subscribe: forwards the caller IP to the service', async () => {
    await controller.subscribe(fakeRequest({ ip: '198.51.100.9' }), { email: 'a@b.com' });

    expect(service.subscribe).toHaveBeenCalledWith({ email: 'a@b.com' }, '198.51.100.9');
  });

  it('subscribe: falls back to X-Forwarded-For when req.ip is unavailable', async () => {
    await controller.subscribe(
      fakeRequest({ ip: undefined, headers: { 'x-forwarded-for': '203.0.113.99, 10.0.0.1' } }),
      { email: 'a@b.com' },
    );

    expect(service.subscribe).toHaveBeenCalledWith({ email: 'a@b.com' }, '203.0.113.99');
  });

  it('confirm: passes the token through to the service', async () => {
    await controller.confirm('tok-123');
    expect(service.confirm).toHaveBeenCalledWith('tok-123');
  });

  it('unsubscribe: passes the token through to the service', async () => {
    await controller.unsubscribe('tok-456');
    expect(service.unsubscribe).toHaveBeenCalledWith('tok-456');
  });

  it('findAll: applies page/limit/status defaults', async () => {
    await controller.findAll({});
    expect(service.findPaginated).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('exportCsv: sets CSV response headers and sends the body', async () => {
    const res = { setHeader: jest.fn(), send: jest.fn() } as unknown as Response;

    await controller.exportCsv(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('attachment; filename='));
    expect(res.send).toHaveBeenCalledWith('email,status\n');
  });

  it('remove: passes the subscriber id through to the service', async () => {
    await controller.remove('sub-1');
    expect(service.remove).toHaveBeenCalledWith('sub-1');
  });
});
