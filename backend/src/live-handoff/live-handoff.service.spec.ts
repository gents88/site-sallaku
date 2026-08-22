import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LiveHandoffService } from './live-handoff.service';
import { LiveHandoffRequest } from './schemas/live-handoff-request.schema';
import { ChatbotService } from '../chatbot/chatbot.service';
import { MailService } from '../mail/mail.service';
import { LiveHandoffGateway } from './live-handoff.gateway';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('LiveHandoffService', () => {
  let service: LiveHandoffService;
  let mockModel: any;
  let mockChatbotService: any;
  let mockMailService: any;
  let mockGateway: any;
  let mockConfig: any;

  beforeEach(async () => {
    mockModel = jest.fn().mockImplementation((data: any) => ({
      ...data,
      _id: 'new-request-id',
      save: jest.fn().mockResolvedValue(undefined),
    }));
    mockModel.findOne = jest.fn();
    mockModel.countDocuments = jest.fn();
    mockModel.findById = jest.fn();
    mockModel.find = jest.fn();

    mockChatbotService = {
      getSession: jest.fn().mockResolvedValue({ messages: [] }),
      appendLiveMessage: jest.fn(),
    };
    mockMailService = {
      sendLiveHandoffRequest: jest.fn().mockResolvedValue({ success: true, accepted: [], rejected: [] }),
    };
    mockGateway = { emitStatusChanged: jest.fn() };
    mockConfig = { get: jest.fn((key: string, fallback?: unknown) => fallback) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveHandoffService,
        { provide: getModelToken(LiveHandoffRequest.name), useValue: mockModel },
        { provide: ChatbotService, useValue: mockChatbotService },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: LiveHandoffGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<LiveHandoffService>(LiveHandoffService);
  });

  describe('createRequest', () => {
    it('creates a new request, notifies Gent by email and reports status "requested"', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      const result = await service.createRequest('session-1', { lastUserMessage: 'ciao' }, '1.2.3.4');

      expect(result.status).toBe('requested');
      expect(result.sessionId).toBe('session-1');
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', status: 'requested' }),
      );

      await flush();
      expect(mockMailService.sendLiveHandoffRequest).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' }),
      );
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('session-1', 'notified');
    });

    it('returns the existing request instead of creating a duplicate when one is already active', async () => {
      const existing = { _id: 'existing-id', sessionId: 'session-1', status: 'notified', expiresAt: new Date() };
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      const result = await service.createRequest('session-1', {}, '1.2.3.4');

      expect(result.requestId).toBe('existing-id');
      expect(mockModel).not.toHaveBeenCalled();
      expect(mockMailService.sendLiveHandoffRequest).not.toHaveBeenCalled();
    });

    it('rejects once the daily cap is reached', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockConfig.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'LIVE_HANDOFF_MAX_PER_DAY' ? 5 : fallback,
      );
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(5) });

      await expect(service.createRequest('session-1', {}, '1.2.3.4')).rejects.toThrow(ConflictException);
    });
  });

  describe('getStatus', () => {
    it('returns status "none" when no request exists for the session', async () => {
      mockModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getStatus('unknown-session');
      expect(result.status).toBe('none');
    });
  });

  describe('markAgentJoining', () => {
    it('throws NotFoundException when the request does not exist', async () => {
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) });
      await expect(service.markAgentJoining('missing-session')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException only when the request was explicitly closed', async () => {
      mockModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ status: 'closed', save: jest.fn() }),
      });
      await expect(service.markAgentJoining('session-1')).rejects.toThrow(ConflictException);
    });

    it('revives an expired request instead of blocking Gent when he shows up late', async () => {
      const doc = { _id: 'req-id', sessionId: 'session-1', status: 'expired', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      const result = await service.markAgentJoining('session-1');

      expect(doc.status).toBe('agent_joining');
      expect(result.status).toBe('agent_joining');
    });

    it('transitions an active request to agent_joining and notifies via the gateway', async () => {
      const doc = { _id: 'req-id', sessionId: 'session-1', status: 'notified', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      const result = await service.markAgentJoining('session-1');

      expect(doc.status).toBe('agent_joining');
      expect(result.status).toBe('agent_joining');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('session-1', 'agent_joining');
    });
  });

  describe('expireStaleRequests', () => {
    it('flips overdue requests to expired and notifies each session room', async () => {
      const stale1 = { sessionId: 'a', status: 'requested', save: jest.fn().mockResolvedValue(undefined) };
      const stale2 = { sessionId: 'b', status: 'notified', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([stale1, stale2]) });

      const count = await service.expireStaleRequests();

      expect(count).toBe(2);
      expect(stale1.status).toBe('expired');
      expect(stale2.status).toBe('expired');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('a', 'expired');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('b', 'expired');
    });
  });
});
