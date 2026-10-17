import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactMessage } from './schemas/contact-message.schema';
import { MailService } from '../mail/mail.service';
import { MailQueueService } from '../mail/mail-queue.service';
import { TurnstileService } from '../common/services/turnstile.service';

describe('ContactService', () => {
  let service: ContactService;
  let mockContactModel: any;
  let mockMailService: any;
  let mockMailQueue: any;
  let mockTurnstileService: any;

  const dto = {
    name: 'Mario Rossi',
    email: 'mario@example.com',
    subject: 'Ciao',
    message: 'Vorrei discutere di un progetto con te, grazie.',
  } as any;

  beforeEach(async () => {
    mockContactModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    mockMailService = { send: jest.fn() };
    mockMailQueue = { enqueueContact: jest.fn().mockResolvedValue(undefined) };
    mockTurnstileService = { verify: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: getModelToken(ContactMessage.name), useValue: mockContactModel },
        { provide: MailService, useValue: mockMailService },
        { provide: MailQueueService, useValue: mockMailQueue },
        { provide: TurnstileService, useValue: mockTurnstileService },
      ],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  describe('findPaginated (admin inbox)', () => {
    function stubQueries() {
      const q: Record<string, jest.Mock> = {};
      for (const m of ['sort', 'skip', 'limit']) q[m] = jest.fn(() => q);
      q.exec = jest.fn().mockResolvedValue([]);
      mockContactModel.find = jest.fn(() => q);
      mockContactModel.countDocuments = jest.fn(() => ({ exec: () => Promise.resolve(0) }));
    }

    it('searches name, email, subject and message with an escaped case-insensitive regex', async () => {
      stubQueries();
      await service.findPaginated({ page: 1, limit: 20, unreadOnly: true, q: 'preventivo (urgente)' });
      const filter = mockContactModel.find.mock.calls[0][0];
      expect(filter.read).toBe(false);
      expect(filter.$or.map((c: Record<string, RegExp>) => Object.keys(c)[0])).toEqual(['name', 'email', 'subject', 'message']);
      expect(filter.$or[0].name.source).toBe('preventivo \\(urgente\\)');
    });

    it('does not add a search clause for a blank query', async () => {
      stubQueries();
      await service.findPaginated({ page: 1, limit: 20, q: '   ' });
      expect(mockContactModel.find.mock.calls[0][0]).toEqual({});
    });
  });

  describe('lead', () => {
    function stubQueries() {
      const q: Record<string, jest.Mock> = {};
      for (const m of ['sort', 'skip', 'limit']) q[m] = jest.fn(() => q);
      q.exec = jest.fn().mockResolvedValue([]);
      mockContactModel.find = jest.fn(() => q);
      mockContactModel.countDocuments = jest.fn(() => ({ exec: () => Promise.resolve(0) }));
    }

    it('il filtro per stato usa la stessa regola dei messaggi senza status', async () => {
      stubQueries();
      await service.findPaginated({ page: 1, limit: 20, status: 'in_progress' });
      const filter = mockContactModel.find.mock.calls[0][0];
      expect(filter.$expr).toEqual({ $eq: [expect.objectContaining({ $ifNull: expect.any(Array) }), 'in_progress'] });
    });

    it('il filtro follow-up prende solo i lead aperti con promemoria scaduto, anche insieme allo stato', async () => {
      stubQueries();
      await service.findPaginated({ page: 1, limit: 20, followUpsDue: true, status: 'new' });
      const filter = mockContactModel.find.mock.calls[0][0];
      expect(filter.followUpAt).toEqual({ $ne: null, $lte: expect.any(Date) });
      expect(filter.duplicateOf).toEqual({ $exists: false });
      expect(filter.$expr.$and).toHaveLength(2);
    });

    it('updateLead salva solo i campi inviati e null toglie il promemoria', async () => {
      mockContactModel.findByIdAndUpdate = jest.fn(() => ({ exec: () => Promise.resolve({ _id: 'c1' }) }));
      await service.updateLead('c1', { status: 'won', followUpAt: null, internalNote: '  budget 5k  ' });
      expect(mockContactModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'c1', { $set: { status: 'won', followUpAt: null, internalNote: 'budget 5k' } }, { new: true },
      );
    });

    it('rispondere a un lead nuovo lo porta in trattativa, non tocca uno già chiuso', async () => {
      const newLead = { name: 'A', subject: 'S', email: 'a@x.it', save: jest.fn(function (this: unknown) { return Promise.resolve(this); }) } as Record<string, unknown>;
      const wonLead = { ...newLead, status: 'won', save: jest.fn(function (this: unknown) { return Promise.resolve(this); }) };
      mockMailService.send.mockResolvedValue({ success: true });
      mockContactModel.findById = jest.fn()
        .mockReturnValueOnce({ exec: () => Promise.resolve(newLead) })
        .mockReturnValueOnce({ exec: () => Promise.resolve(wonLead) });

      await service.replyToContact('c1', 'Grazie!');
      await service.replyToContact('c2', 'Grazie!');

      expect(newLead.status).toBe('in_progress');
      expect(wonLead.status).toBe('won');
    });

    it('leadStats: conteggi per stato, tasso di chiusura vinta e follow-up', async () => {
      mockContactModel.aggregate = jest.fn(() => ({ exec: () => Promise.resolve([{ _id: 'new', count: 4 }, { _id: 'won', count: 3 }, { _id: 'lost', count: 1 }]) }));
      const due = [{ _id: 'c9', name: 'Luca', subject: 'Preventivo', followUpAt: new Date('2026-10-16T08:00:00Z'), repliedAt: new Date() }];
      mockContactModel.find = jest.fn()
        .mockReturnValueOnce({ lean: () => ({ exec: () => Promise.resolve([{ createdAt: new Date('2026-10-01T10:00:00Z'), repliedAt: new Date('2026-10-01T14:00:00Z') }]) }) })
        .mockReturnValueOnce({ sort: () => ({ limit: () => ({ lean: () => ({ exec: () => Promise.resolve(due) }) }) }) });
      mockContactModel.countDocuments = jest.fn(() => ({ exec: () => Promise.resolve(1) }));

      const stats = await service.leadStats(new Date('2026-10-17T10:00:00Z'));

      expect(stats.byStatus).toEqual({ new: 4, in_progress: 0, won: 3, lost: 1 });
      expect(stats.winRate).toBe(75);
      expect(stats.avgFirstResponseHours).toBe(4);
      expect(stats.followUpsDue).toBe(1);
      expect(stats.followUps).toEqual([expect.objectContaining({ _id: 'c9', status: 'in_progress' })]);
    });
  });

  describe('sendMessage', () => {
    it('rejects when the honeypot field is filled', async () => {
      await expect(
        service.sendMessage({ ...dto, website: 'http://spam.example' }, {}),
      ).rejects.toThrow(BadRequestException);
      expect(mockContactModel.create).not.toHaveBeenCalled();
    });

    it('rejects when Turnstile verification fails', async () => {
      mockTurnstileService.verify.mockResolvedValue(false);

      await expect(service.sendMessage(dto, { ip: '127.0.0.1' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockContactModel.create).not.toHaveBeenCalled();
    });

    it('persists the message and enqueues a notification on success', async () => {
      mockContactModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockContactModel.create.mockResolvedValue({ _id: 'abc123' });

      const result = await service.sendMessage(dto, { ip: '127.0.0.1', location: 'Rome, Italy' });

      expect(result).toEqual({ success: true });
      expect(mockContactModel.create).toHaveBeenCalledWith(dto);
      expect(mockMailQueue.enqueueContact).toHaveBeenCalledWith(
        expect.objectContaining({ email: dto.email, contactId: 'abc123' }),
      );
    });

    it('records a duplicate without enqueueing a second notification when the same email+message repeats within 60s', async () => {
      const duplicate = { _id: 'existing-id' };
      mockContactModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(duplicate) });
      mockContactModel.create.mockResolvedValue({ _id: 'dup-copy' });

      const result = await service.sendMessage(dto, { ip: '127.0.0.1' });

      expect(result).toEqual({ success: true });
      expect(mockContactModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ duplicateOf: duplicate._id }),
      );
      expect(mockMailQueue.enqueueContact).not.toHaveBeenCalled();
    });
  });
});
