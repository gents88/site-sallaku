import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { LiveHandoffGateway } from './live-handoff.gateway';
import { LiveHandoffService } from './live-handoff.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { UsersService } from '../users/users.service';
import { AdminEventsService } from '../common/services/admin-events.service';

const SID = 'session-0001';

describe('LiveHandoffGateway', () => {
  let gateway: LiveHandoffGateway;
  let mockLiveHandoffService: any;
  let mockChatbotService: any;
  let mockJwtService: any;
  let mockUsersService: any;
  let adminEvents: AdminEventsService;
  let mockServer: any;
  let mockClient: any;

  beforeEach(async () => {
    mockLiveHandoffService = {
      getStatus: jest.fn(),
      markAgentJoining: jest.fn(),
      markLive: jest.fn().mockResolvedValue(undefined),
      closeSession: jest.fn().mockResolvedValue(undefined),
      touchActivity: jest.fn().mockResolvedValue(undefined),
    };
    mockChatbotService = { appendLiveMessage: jest.fn() };
    mockJwtService = { verify: jest.fn() };
    // Il ruolo si legge dal DB: 'admin-1' è admin, chiunque altro no.
    mockUsersService = { findById: jest.fn(async (id: string) => (id === 'admin-1' ? { role: 'admin' } : { role: 'user' })) };
    adminEvents = new AdminEventsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveHandoffGateway,
        { provide: LiveHandoffService, useValue: mockLiveHandoffService },
        { provide: ChatbotService, useValue: mockChatbotService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AdminEventsService, useValue: adminEvents },
      ],
    }).compile();

    gateway = module.get<LiveHandoffGateway>(LiveHandoffGateway);

    mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = mockServer;
    mockClient = { id: 'socket-1', join: jest.fn().mockResolvedValue(undefined), emit: jest.fn(), data: {} };
  });

  describe('admin authorization (security)', () => {
    it('rejects a validly signed token of a non-admin user (was accepted before)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-9', role: 'user' });

      await gateway.onAdminJoin(mockClient, { sessionId: SID, token: 'user-token' });

      expect(mockClient.emit).toHaveBeenCalledWith('error', { message: 'Non autorizzato' });
      expect(mockLiveHandoffService.markAgentJoining).not.toHaveBeenCalled();
    });

    it('does not trust a forged role claim: the role comes from the database', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-9', role: 'admin' });

      await gateway.onAdminClose(mockClient, { sessionId: SID, token: 't' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });

    it('authenticates an admin at handshake and joins the admins room', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      const client = { ...mockClient, handshake: { auth: { token: 'admin-token' } } };

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('admins');
      expect(client.data.isAdmin).toBe(true);
    });

    it('lets a visitor connect without joining the admins room', async () => {
      const client = { ...mockClient, handshake: { auth: {} } };
      await gateway.handleConnection(client);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('accepts admin actions without a per-message token once authenticated at handshake', async () => {
      await gateway.onAdminClose({ ...mockClient, data: { isAdmin: true } }, { sessionId: SID });
      expect(mockLiveHandoffService.closeSession).toHaveBeenCalledWith(SID);
    });

    it('relays domain events to the admins room', () => {
      gateway.afterInit();
      adminEvents.notify('contact', 'Preventivo');
      expect(mockServer.to).toHaveBeenCalledWith('admins');
      expect(mockServer.emit).toHaveBeenCalledWith('admin_notification', expect.objectContaining({ type: 'contact', title: 'Preventivo' }));
      gateway.onModuleDestroy();
    });
  });

  describe('onJoinSession', () => {
    it('joins the session room when a sessionId is provided', async () => {
      await gateway.onJoinSession(mockClient, { sessionId: SID });

      expect(mockClient.join).toHaveBeenCalledWith('live-handoff:session-0001');
    });

    it('does nothing when sessionId is missing', async () => {
      await gateway.onJoinSession(mockClient, {});

      expect(mockClient.join).not.toHaveBeenCalled();
    });
  });

  describe('onVisitorMessage', () => {
    it('ignores the message when the handoff is not live', async () => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'requested' });

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'ciao' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('accetta il messaggio del visitatore anche durante "agent_joining"', async () => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'agent_joining' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date('2026-01-01') });

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'ciao' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith(SID, 'user', 'ciao');
    });

    it('ignores the message when text is missing or blank, without even checking status', async () => {
      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: '   ' });

      expect(mockLiveHandoffService.getStatus).not.toHaveBeenCalled();
      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('ignores the message when sessionId is missing', async () => {
      await gateway.onVisitorMessage(mockClient, { text: 'ciao' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('persists and broadcasts the message once the handoff is live', async () => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date('2026-01-01') });

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'ciao Gent' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith(SID, 'user', 'ciao Gent');
      expect(mockLiveHandoffService.touchActivity).toHaveBeenCalledWith(SID);
      expect(mockServer.to).toHaveBeenCalledWith('live-handoff:session-0001');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'chat_message',
        expect.objectContaining({ sessionId: SID, from: 'visitor', text: 'ciao Gent' }),
      );
    });

    it('non tocca il clock di inattività quando il messaggio viene scartato', async () => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'requested' });

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'ciao' });

      expect(mockLiveHandoffService.touchActivity).not.toHaveBeenCalled();
    });
  });

  describe('onAdminJoin', () => {
    it('rejects when the token is missing or invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await gateway.onAdminJoin(mockClient, { sessionId: SID, token: 'bad' });

      expect(mockClient.emit).toHaveBeenCalledWith('error', expect.any(Object));
      expect(mockLiveHandoffService.markAgentJoining).not.toHaveBeenCalled();
    });

    it('rejects a valid token that is missing the sessionId', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });

      await gateway.onAdminJoin(mockClient, { token: 'good' });

      expect(mockClient.emit).toHaveBeenCalledWith('error', expect.any(Object));
      expect(mockLiveHandoffService.markAgentJoining).not.toHaveBeenCalled();
    });

    it('joins the room and broadcasts agent_joined for a valid admin token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
      mockLiveHandoffService.markAgentJoining.mockResolvedValue({ sessionId: SID, status: 'agent_joining' });

      await gateway.onAdminJoin(mockClient, { sessionId: SID, token: 'good' });

      expect(mockClient.join).toHaveBeenCalledWith('live-handoff:session-0001');
      expect(mockServer.emit).toHaveBeenCalledWith('agent_joined', expect.objectContaining({ sessionId: SID }));
      expect(mockLiveHandoffService.markLive).toHaveBeenCalledWith(SID);
    });

    it('emits an error to the admin instead of hanging when the request can no longer be joined', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
      mockLiveHandoffService.markAgentJoining.mockRejectedValue(new Error('Questa richiesta è stata chiusa.'));

      await gateway.onAdminJoin(mockClient, { sessionId: SID, token: 'good' });

      expect(mockClient.emit).toHaveBeenCalledWith('error', { message: 'Questa richiesta è stata chiusa.' });
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalledWith('agent_joined', expect.anything());
    });
  });

  describe('onAdminMessage', () => {
    // Regressione: accettare solo "live" scartava in silenzio i messaggi scritti nella
    // finestra fra l'ingresso di Gent e il passaggio a "live" — sintomo per l'utente:
    // "rispondo ma il visitatore non riceve nulla", senza alcun errore.
    it('accetta il messaggio anche mentre lo stato è ancora "agent_joining"', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'agent_joining' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date('2026-01-01') });

      await gateway.onAdminMessage(mockClient, { sessionId: SID, text: 'ciao', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith(SID, 'agent', 'ciao');
      expect(mockServer.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({ from: 'agent' }));
    });

    it.each(['expired', 'closed', 'requested', 'notified', 'none'])(
      'con stato "%s" avvisa Gent invece di scartare il messaggio in silenzio',
      async (status) => {
        mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
        mockLiveHandoffService.getStatus.mockResolvedValue({ status });

        await gateway.onAdminMessage(mockClient, { sessionId: SID, text: 'ciao', token: 'good' });

        expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
        expect(mockClient.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
      },
    );

    it('drops the message when the admin token does not verify', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await gateway.onAdminMessage(mockClient, { sessionId: SID, text: 'ciao', token: 'bad' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('persists and broadcasts an authenticated admin message once the handoff is live', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date('2026-01-01') });

      await gateway.onAdminMessage(mockClient, { sessionId: SID, text: 'ciao, sono Gent', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith(SID, 'agent', 'ciao, sono Gent');
      expect(mockLiveHandoffService.touchActivity).toHaveBeenCalledWith(SID);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'chat_message',
        expect.objectContaining({ sessionId: SID, from: 'agent' }),
      );
    });

    it('drops the message when text is missing or blank, even with a valid live handoff', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });

      await gateway.onAdminMessage(mockClient, { sessionId: SID, text: '   ', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('drops the message when sessionId is missing', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });

      await gateway.onAdminMessage(mockClient, { text: 'ciao', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });
  });

  describe('onAdminClose', () => {
    it('closes the session for a valid admin token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });

      await gateway.onAdminClose(mockClient, { sessionId: SID, token: 'good' });

      expect(mockLiveHandoffService.closeSession).toHaveBeenCalledWith(SID);
    });

    it('does not close the session when the token is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await gateway.onAdminClose(mockClient, { sessionId: SID, token: 'bad' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });

    it('does not close the session when sessionId is missing', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });

      await gateway.onAdminClose(mockClient, { token: 'good' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });
  });

  describe('onVisitorClose', () => {
    it('closes the session — nessuna auth richiesta: il visitatore non ha un token, il sessionId stesso è la capability', async () => {
      await gateway.onVisitorClose(mockClient, { sessionId: SID });

      expect(mockLiveHandoffService.closeSession).toHaveBeenCalledWith(SID);
    });

    it('does not close anything when sessionId is missing', async () => {
      await gateway.onVisitorClose(mockClient, {});

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });
  });

  describe('sessionId non stringa (iniezione di operatori Mongo via WebSocket)', () => {
    const injected = { $ne: null } as unknown as string;

    it('visitor_close non chiude nessuna sessione', async () => {
      await gateway.onVisitorClose(mockClient, { sessionId: injected });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });

    it('visitor_message non interroga né scrive nulla', async () => {
      await gateway.onVisitorMessage(mockClient, { sessionId: injected, text: 'ciao' });

      expect(mockLiveHandoffService.getStatus).not.toHaveBeenCalled();
      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('join_session non fa entrare in nessuna stanza', async () => {
      await gateway.onJoinSession(mockClient, { sessionId: injected });

      expect(mockClient.join).not.toHaveBeenCalled();
    });

    it('le azioni admin rifiutano un sessionId non valido anche con token valido', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });

      await gateway.onAdminClose(mockClient, { sessionId: injected, token: 'good' });
      await gateway.onAdminMessage(mockClient, { sessionId: injected, text: 'x', token: 'good' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('il testo non stringa viene ignorato senza eccezioni', async () => {
      await expect(
        gateway.onVisitorMessage(mockClient, { sessionId: SID, text: { $ne: '' } as unknown as string }),
      ).resolves.toBeUndefined();

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });
  });

  describe('token admin', () => {
    it('un refresh token non vale come token admin, anche se firmato correttamente', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1', type: 'refresh' });

      await gateway.onAdminClose(mockClient, { sessionId: SID, token: 'refresh-token' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });
  });

  describe('rate limit del visitatore', () => {
    beforeEach(() => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date() });
    });

    it('dopo 20 messaggi in 30 s scarta i successivi e avvisa il client', async () => {
      for (let i = 0; i < 20; i++) {
        await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: `m${i}` });
      }
      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledTimes(20);

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'troppi' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledTimes(20);
      expect(mockClient.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    });

    it('il limite è per socket: un altro visitatore scrive normalmente', async () => {
      for (let i = 0; i < 21; i++) {
        await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: `m${i}` });
      }
      const other = { ...mockClient, id: 'socket-2', emit: jest.fn() };

      await gateway.onVisitorMessage(other, { sessionId: SID, text: 'ciao' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledTimes(21);
    });

    it('alla disconnessione lo stato del socket viene liberato', async () => {
      for (let i = 0; i < 20; i++) {
        await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: `m${i}` });
      }
      gateway.handleDisconnect(mockClient);

      await gateway.onVisitorMessage(mockClient, { sessionId: SID, text: 'di nuovo' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledTimes(21);
    });
  });

  describe('emitStatusChanged', () => {
    it('broadcasts the new status to the session room', () => {
      gateway.emitStatusChanged(SID, 'expired');

      expect(mockServer.to).toHaveBeenCalledWith('live-handoff:session-0001');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'handoff_status_changed',
        expect.objectContaining({ sessionId: SID, status: 'expired' }),
      );
    });
  });
});
