import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { LiveHandoffGateway } from './live-handoff.gateway';
import { LiveHandoffService } from './live-handoff.service';
import { ChatbotService } from '../chatbot/chatbot.service';

describe('LiveHandoffGateway', () => {
  let gateway: LiveHandoffGateway;
  let mockLiveHandoffService: any;
  let mockChatbotService: any;
  let mockJwtService: any;
  let mockServer: any;
  let mockClient: any;

  beforeEach(async () => {
    mockLiveHandoffService = {
      getStatus: jest.fn(),
      markAgentJoining: jest.fn(),
      markLive: jest.fn().mockResolvedValue(undefined),
      closeSession: jest.fn().mockResolvedValue(undefined),
    };
    mockChatbotService = { appendLiveMessage: jest.fn() };
    mockJwtService = { verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveHandoffGateway,
        { provide: LiveHandoffService, useValue: mockLiveHandoffService },
        { provide: ChatbotService, useValue: mockChatbotService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    gateway = module.get<LiveHandoffGateway>(LiveHandoffGateway);

    mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
    gateway.server = mockServer;
    mockClient = { id: 'socket-1', join: jest.fn().mockResolvedValue(undefined), emit: jest.fn() };
  });

  describe('onJoinSession', () => {
    it('joins the session room when a sessionId is provided', async () => {
      await gateway.onJoinSession(mockClient, { sessionId: 's1' });

      expect(mockClient.join).toHaveBeenCalledWith('live-handoff:s1');
    });

    it('does nothing when sessionId is missing', async () => {
      await gateway.onJoinSession(mockClient, {});

      expect(mockClient.join).not.toHaveBeenCalled();
    });
  });

  describe('onVisitorMessage', () => {
    it('ignores the message when the handoff is not live', async () => {
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'requested' });

      await gateway.onVisitorMessage(mockClient, { sessionId: 's1', text: 'ciao' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('ignores the message when text is missing or blank, without even checking status', async () => {
      await gateway.onVisitorMessage(mockClient, { sessionId: 's1', text: '   ' });

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

      await gateway.onVisitorMessage(mockClient, { sessionId: 's1', text: 'ciao Gent' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith('s1', 'user', 'ciao Gent');
      expect(mockServer.to).toHaveBeenCalledWith('live-handoff:s1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'chat_message',
        expect.objectContaining({ sessionId: 's1', from: 'visitor', text: 'ciao Gent' }),
      );
    });
  });

  describe('onAdminJoin', () => {
    it('rejects when the token is missing or invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await gateway.onAdminJoin(mockClient, { sessionId: 's1', token: 'bad' });

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
      mockLiveHandoffService.markAgentJoining.mockResolvedValue({ sessionId: 's1', status: 'agent_joining' });

      await gateway.onAdminJoin(mockClient, { sessionId: 's1', token: 'good' });

      expect(mockClient.join).toHaveBeenCalledWith('live-handoff:s1');
      expect(mockServer.emit).toHaveBeenCalledWith('agent_joined', expect.objectContaining({ sessionId: 's1' }));
      expect(mockLiveHandoffService.markLive).toHaveBeenCalledWith('s1');
    });

    it('emits an error to the admin instead of hanging when the request can no longer be joined', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
      mockLiveHandoffService.markAgentJoining.mockRejectedValue(new Error('Questa richiesta è stata chiusa.'));

      await gateway.onAdminJoin(mockClient, { sessionId: 's1', token: 'good' });

      expect(mockClient.emit).toHaveBeenCalledWith('error', { message: 'Questa richiesta è stata chiusa.' });
      expect(mockClient.join).not.toHaveBeenCalled();
      expect(mockServer.emit).not.toHaveBeenCalledWith('agent_joined', expect.anything());
    });
  });

  describe('onAdminMessage', () => {
    it('drops the message when the handoff is not live yet, even with a valid admin token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'agent_joining' });

      await gateway.onAdminMessage(mockClient, { sessionId: 's1', text: 'ciao', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('drops the message when the admin token does not verify', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await gateway.onAdminMessage(mockClient, { sessionId: 's1', text: 'ciao', token: 'bad' });

      expect(mockChatbotService.appendLiveMessage).not.toHaveBeenCalled();
    });

    it('persists and broadcasts an authenticated admin message once the handoff is live', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });
      mockChatbotService.appendLiveMessage.mockResolvedValue({ timestamp: new Date('2026-01-01') });

      await gateway.onAdminMessage(mockClient, { sessionId: 's1', text: 'ciao, sono Gent', token: 'good' });

      expect(mockChatbotService.appendLiveMessage).toHaveBeenCalledWith('s1', 'agent', 'ciao, sono Gent');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'chat_message',
        expect.objectContaining({ sessionId: 's1', from: 'agent' }),
      );
    });

    it('drops the message when text is missing or blank, even with a valid live handoff', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });
      mockLiveHandoffService.getStatus.mockResolvedValue({ status: 'live' });

      await gateway.onAdminMessage(mockClient, { sessionId: 's1', text: '   ', token: 'good' });

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

      await gateway.onAdminClose(mockClient, { sessionId: 's1', token: 'good' });

      expect(mockLiveHandoffService.closeSession).toHaveBeenCalledWith('s1');
    });

    it('does not close the session when the token is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await gateway.onAdminClose(mockClient, { sessionId: 's1', token: 'bad' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });

    it('does not close the session when sessionId is missing', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'admin-1' });

      await gateway.onAdminClose(mockClient, { token: 'good' });

      expect(mockLiveHandoffService.closeSession).not.toHaveBeenCalled();
    });
  });

  describe('emitStatusChanged', () => {
    it('broadcasts the new status to the session room', () => {
      gateway.emitStatusChanged('s1', 'expired');

      expect(mockServer.to).toHaveBeenCalledWith('live-handoff:s1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'handoff_status_changed',
        expect.objectContaining({ sessionId: 's1', status: 'expired' }),
      );
    });
  });
});
