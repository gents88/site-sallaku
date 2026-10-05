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
    mockModel.updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });

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

    it('still moves the request to "notified" even when the email fails to send', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      mockMailService.sendLiveHandoffRequest.mockResolvedValue({ success: false, accepted: [], rejected: ['x'] });

      await service.createRequest('session-1', {}, '1.2.3.4');
      await flush();

      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('session-1', 'notified');
    });

    it('does not blow up when fetching the chat session for the email context throws', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      mockChatbotService.getSession.mockRejectedValue(new Error('session vanished'));

      await service.createRequest('session-1', {}, '1.2.3.4');
      await flush();

      expect(mockMailService.sendLiveHandoffRequest).toHaveBeenCalledWith(
        expect.objectContaining({ recentMessages: [] }),
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

    it('returns the current status when a request exists', async () => {
      const doc = { _id: 'req-id', sessionId: 'session-1', status: 'live', expiresAt: new Date('2026-01-01') };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      const result = await service.getStatus('session-1');

      expect(result).toEqual({
        requestId: 'req-id',
        sessionId: 'session-1',
        status: 'live',
        expiresAt: doc.expiresAt,
      });
    });
  });

  describe('listActive', () => {
    function mockFind(docs: any[]) {
      const chain: any = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(docs),
      };
      mockModel.find.mockReturnValue(chain);
      return chain;
    }

    it('interroga TUTTI gli stati attivi, non solo quelli in attesa (serve per rientrare in una chat già avviata)', async () => {
      mockFind([]);

      await service.listActive();

      expect(mockModel.find).toHaveBeenCalledWith({
        status: { $in: ['requested', 'notified', 'agent_joining', 'live'] },
      });
    });

    it('mappa i documenti nel DTO esposto alla dashboard', async () => {
      const requestedAt = new Date('2026-08-23T10:00:00Z');
      const expiresAt = new Date('2026-08-23T10:15:00Z');
      mockFind([
        {
          _id: 'req-1',
          sessionId: 'sess-1',
          status: 'live',
          lastUserMessage: 'ciao Gent',
          locale: 'it',
          createdAt: requestedAt,
          expiresAt,
        },
      ]);

      const result = await service.listActive();

      expect(result).toEqual([
        {
          requestId: 'req-1',
          sessionId: 'sess-1',
          status: 'live',
          lastUserMessage: 'ciao Gent',
          locale: 'it',
          requestedAt,
          expiresAt,
        },
      ]);
    });

    it('normalizza a null i campi opzionali mancanti invece di restituire undefined', async () => {
      mockFind([
        { _id: 'req-2', sessionId: 'sess-2', status: 'requested', createdAt: new Date(), expiresAt: new Date() },
      ]);

      const [row] = await service.listActive();

      expect(row.lastUserMessage).toBeNull();
      expect(row.locale).toBeNull();
    });

    it('restituisce lista vuota quando non c’è nessuna sessione attiva', async () => {
      mockFind([]);
      expect(await service.listActive()).toEqual([]);
    });

    it('ordina dalla più recente e limita il numero di risultati', async () => {
      const chain = mockFind([]);

      await service.listActive();

      expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(chain.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('markAgentJoining', () => {
    it('throws NotFoundException when the request does not exist', async () => {
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) });
      await expect(service.markAgentJoining('missing-session')).rejects.toThrow(NotFoundException);
    });

    // Nessuno stato deve poter escludere Gent dalla sua stessa conversazione:
    // "closed" scatta anche solo navigando via dalla pagina admin, quindi bloccarlo
    // significherebbe che un "torna alla dashboard" gli impedisce di rientrare.
    it.each(['closed', 'expired', 'requested', 'notified', 'agent_joining', 'live'])(
      'lascia rientrare Gent anche da uno stato "%s"',
      async (status) => {
        const doc = { _id: 'req-id', sessionId: 'session-1', status, save: jest.fn().mockResolvedValue(undefined) };
        mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

        const result = await service.markAgentJoining('session-1');

        expect(result.status).toBe('agent_joining');
        expect(doc.status).toBe('agent_joining');
      },
    );

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

    it('allows re-joining a request that is already live (second tab / reconnect)', async () => {
      const doc = { _id: 'req-id', sessionId: 'session-1', status: 'live', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      const result = await service.markAgentJoining('session-1');

      expect(result.status).toBe('agent_joining');
    });
  });

  describe('markLive', () => {
    it('transitions agent_joining to live and notifies via the gateway', async () => {
      const doc = { sessionId: 'session-1', status: 'agent_joining', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      await service.markLive('session-1');

      expect(doc.status).toBe('live');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('session-1', 'live');
    });

    // Regressione: una sessione può avere PIÙ richieste (una scaduta e una nuova).
    // Se markLive non ordina per data, porta a "live" un documento vecchio e lascia il
    // più recente su "agent_joining": da lì getStatus non dice mai "live" e ogni
    // messaggio di Gent viene scartato in silenzio.
    it('agisce sulla richiesta PIÙ RECENTE, la stessa su cui ha agito markAgentJoining', async () => {
      const sort = jest.fn().mockReturnThis();
      const doc = { sessionId: 'session-1', status: 'agent_joining', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort, exec: jest.fn().mockResolvedValue(doc) });

      await service.markLive('session-1');

      expect(mockModel.findOne).toHaveBeenCalledWith({ sessionId: 'session-1' });
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(doc.status).toBe('live');
    });

    it('non tocca la richiesta più recente se non è in uno stato di ingresso', async () => {
      const doc = { sessionId: 'session-1', status: 'expired', save: jest.fn() };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });

      await service.markLive('session-1');

      expect(doc.status).toBe('expired');
      expect(doc.save).not.toHaveBeenCalled();
      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
    });

    it('does nothing when there is no request for the session', async () => {
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(null) });

      await service.markLive('session-1');

      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
    });

    // Senza questo, una chat che diventa "live" dopo che Gent ha impiegato qualche
    // minuto a entrare erediterebbe un lastActivityAt vecchio e il cron di inattività
    // la chiuderebbe subito, prima ancora che i due si scambino un messaggio.
    it('resetta lastActivityAt al momento in cui la chat diventa live', async () => {
      const doc = { sessionId: 'session-1', status: 'agent_joining', lastActivityAt: new Date('2020-01-01'), save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ sort: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(doc) });
      const before = Date.now();

      await service.markLive('session-1');

      expect(doc.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('touchActivity', () => {
    it('aggiorna lastActivityAt solo per la richiesta live della sessione', async () => {
      await service.touchActivity('session-1');

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { sessionId: 'session-1', status: 'live' },
        { $set: { lastActivityAt: expect.any(Date) } },
      );
    });
  });

  describe('closeSession', () => {
    it('closes an active session and notifies via the gateway', async () => {
      const doc = { sessionId: 'session-1', status: 'live', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) });

      await service.closeSession('session-1');

      expect(doc.status).toBe('closed');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('session-1', 'closed');
    });

    it('does nothing when there is no active session to close', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await service.closeSession('session-1');

      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
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

    it('does nothing and notifies no one when no request is overdue', async () => {
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      const count = await service.expireStaleRequests();

      expect(count).toBe(0);
      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('closeInactiveLiveSessions', () => {
    it('chiude le chat live senza attività da più della soglia di inattività', async () => {
      const inactive = { sessionId: 'a', status: 'live', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([inactive]) });

      const count = await service.closeInactiveLiveSessions();

      expect(count).toBe(1);
      expect(inactive.status).toBe('closed');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('a', 'closed');
    });

    it('cerca solo le sessioni "live" più vecchie della soglia configurata (default 5 minuti)', async () => {
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const before = Date.now();

      await service.closeInactiveLiveSessions();

      const filter = mockModel.find.mock.calls[0][0];
      expect(filter.status).toBe('live');
      const cutoff = filter.lastActivityAt.$lt as Date;
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(5 * 60_000 - 5_000);
      expect(before - cutoff.getTime()).toBeLessThanOrEqual(5 * 60_000 + 5_000);
    });

    it('rispetta LIVE_HANDOFF_INACTIVITY_MINUTES quando configurato', async () => {
      mockConfig.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'LIVE_HANDOFF_INACTIVITY_MINUTES' ? 10 : fallback,
      );
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const before = Date.now();

      await service.closeInactiveLiveSessions();

      const filter = mockModel.find.mock.calls[0][0];
      const cutoff = filter.lastActivityAt.$lt as Date;
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(10 * 60_000 - 5_000);
      expect(before - cutoff.getTime()).toBeLessThanOrEqual(10 * 60_000 + 5_000);
    });

    it('non tocca nulla quando non ci sono sessioni live inattive', async () => {
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      expect(await service.closeInactiveLiveSessions()).toBe(0);
      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
    });
  });

  describe('closeAbandonedSessions', () => {
    it('chiude le chat aperte e mai chiuse, così non restano "live" per sempre nella dashboard', async () => {
      const abandoned = { sessionId: 'a', status: 'live', save: jest.fn().mockResolvedValue(undefined) };
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([abandoned]) });

      const count = await service.closeAbandonedSessions();

      expect(count).toBe(1);
      expect(abandoned.status).toBe('closed');
      expect(mockGateway.emitStatusChanged).toHaveBeenCalledWith('a', 'closed');
    });

    it('cerca solo le sessioni già avviate e più vecchie della soglia', async () => {
      mockConfig.get.mockImplementation((key: string, fallback?: unknown) =>
        key === 'LIVE_HANDOFF_SESSION_MAX_HOURS' ? 2 : fallback,
      );
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const before = Date.now();

      await service.closeAbandonedSessions();

      const filter = mockModel.find.mock.calls[0][0];
      expect(filter.status).toEqual({ $in: ['agent_joining', 'live'] });
      const cutoff = filter.createdAt.$lt as Date;
      // ~2 ore nel passato (tolleranza per il tempo di esecuzione del test)
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(2 * 3600_000 - 5_000);
      expect(before - cutoff.getTime()).toBeLessThanOrEqual(2 * 3600_000 + 5_000);
    });

    it('non tocca nulla quando non ci sono sessioni abbandonate', async () => {
      mockModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      expect(await service.closeAbandonedSessions()).toBe(0);
      expect(mockGateway.emitStatusChanged).not.toHaveBeenCalled();
    });
  });
});
