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
