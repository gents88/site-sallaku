import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterSubscriber } from './schemas/newsletter-subscriber.schema';
import { MailService } from '../mail/mail.service';
import { TurnstileService } from '../common/services/turnstile.service';

describe('NewsletterService', () => {
  let service: NewsletterService;
  let model: any;
  let mailService: any;
  let turnstileService: any;

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mailService = { sendNewsletterConfirm: jest.fn().mockResolvedValue({ success: true, accepted: [], rejected: [] }) };
    turnstileService = { verify: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsletterService,
        { provide: getModelToken(NewsletterSubscriber.name), useValue: model },
        { provide: MailService, useValue: mailService },
        { provide: TurnstileService, useValue: turnstileService },
      ],
    }).compile();

    service = module.get<NewsletterService>(NewsletterService);
  });

  describe('subscribe', () => {
    it('rejects when the honeypot field is filled, without touching the database', async () => {
      await expect(service.subscribe({ email: 'a@b.com', website: 'http://spam.example' })).rejects.toThrow(BadRequestException);
      expect(model.findOne).not.toHaveBeenCalled();
    });

    it('rejects when Turnstile verification fails', async () => {
      turnstileService.verify.mockResolvedValue(false);

      await expect(service.subscribe({ email: 'a@b.com' })).rejects.toThrow(BadRequestException);
    });

    it('creates a new pending subscriber and sends the confirm email', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      model.create.mockResolvedValue({ _id: 'new-1' });

      const result = await service.subscribe({ email: 'New@Example.com' });

      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com', status: 'pending' }),
      );
      expect(mailService.sendNewsletterConfirm).toHaveBeenCalledWith('new@example.com', expect.any(String));
      expect(result).toEqual({ message: expect.any(String) });
    });

    it('re-sends a fresh confirm token for an already-pending subscriber', async () => {
      const existing = { email: 'a@b.com', status: 'pending', save: jest.fn().mockResolvedValue(undefined) };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      await service.subscribe({ email: 'a@b.com' });

      expect(existing.save).toHaveBeenCalled();
      expect(existing.status).toBe('pending');
      expect(model.create).not.toHaveBeenCalled();
      expect(mailService.sendNewsletterConfirm).toHaveBeenCalledWith('a@b.com', expect.any(String));
    });

    it('requires fresh consent when re-subscribing after unsubscribing, instead of silently reactivating', async () => {
      const existing = { email: 'a@b.com', status: 'unsubscribed', save: jest.fn().mockResolvedValue(undefined) };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      await service.subscribe({ email: 'a@b.com' });

      expect(existing.status).toBe('pending');
      expect(mailService.sendNewsletterConfirm).toHaveBeenCalled();
    });

    it('returns the same generic message for an already-confirmed address, without re-sending anything (no enumeration)', async () => {
      const existing = { email: 'a@b.com', status: 'confirmed', save: jest.fn() };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      const result = await service.subscribe({ email: 'a@b.com' });

      expect(mailService.sendNewsletterConfirm).not.toHaveBeenCalled();
      expect(existing.save).not.toHaveBeenCalled();
      expect(result).toEqual({ message: expect.any(String) });
    });
  });

  describe('confirm', () => {
    it('rejects a missing token without querying the database', async () => {
      await expect(service.confirm('')).rejects.toThrow(BadRequestException);
      expect(model.findOne).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired token', async () => {
      model.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) });

      await expect(service.confirm('bad-token')).rejects.toThrow(BadRequestException);
    });

    it('confirms a valid token and clears the confirm-token fields', async () => {
      const subscriber = {
        email: 'a@b.com',
        status: 'pending',
        confirmTokenHash: 'hash',
        confirmTokenExpires: new Date(Date.now() + 1000),
        save: jest.fn().mockResolvedValue(undefined),
      };
      model.findOne.mockReturnValue({ select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(subscriber) }) });

      const result = await service.confirm('good-token');

      expect(subscriber.status).toBe('confirmed');
      expect(subscriber.confirmTokenHash).toBeUndefined();
      expect(subscriber.confirmTokenExpires).toBeUndefined();
      expect(subscriber.save).toHaveBeenCalled();
      expect(result).toEqual({ email: 'a@b.com' });
    });
  });

  describe('unsubscribe', () => {
    it('rejects a missing token', async () => {
      await expect(service.unsubscribe('')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown token', async () => {
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.unsubscribe('unknown')).rejects.toThrow(NotFoundException);
    });

    it('marks a confirmed subscriber as unsubscribed', async () => {
      const subscriber = { email: 'a@b.com', status: 'confirmed', save: jest.fn().mockResolvedValue(undefined) };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(subscriber) });

      const result = await service.unsubscribe('token-1');

      expect(subscriber.status).toBe('unsubscribed');
      expect(subscriber.save).toHaveBeenCalled();
      expect(result).toEqual({ email: 'a@b.com' });
    });

    it('is idempotent for an already-unsubscribed address', async () => {
      const subscriber = { email: 'a@b.com', status: 'unsubscribed', save: jest.fn() };
      model.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(subscriber) });

      await service.unsubscribe('token-1');

      expect(subscriber.save).not.toHaveBeenCalled();
    });
  });

  describe('counts', () => {
    it('reports counts per status plus the total', async () => {
      model.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(2) }) // pending
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(5) }) // confirmed
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(1) }) // unsubscribed
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(8) }); // total

      const result = await service.counts();

      expect(result).toEqual({ pending: 2, confirmed: 5, unsubscribed: 1, total: 8 });
    });
  });

  describe('remove', () => {
    it('deletes the subscriber by id', async () => {
      model.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });

      await service.remove('sub-1');

      expect(model.findByIdAndDelete).toHaveBeenCalledWith('sub-1');
    });
  });

  describe('exportCsv', () => {
    it('renders a CSV header plus one row per subscriber', async () => {
      model.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              lean: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([
                  { email: 'a@b.com', status: 'confirmed', createdAt: new Date('2026-01-01'), confirmedAt: new Date('2026-01-02') },
                ]),
              }),
            }),
          }),
        }),
      });

      const csv = await service.exportCsv();

      expect(csv.split('\n')).toHaveLength(2);
      expect(csv).toContain('email,status,subscribedAt,confirmedAt');
      expect(csv).toContain('a@b.com,confirmed,');
    });
  });
});
