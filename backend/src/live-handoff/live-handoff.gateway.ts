import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveHandoffService } from './live-handoff.service';
import { ChatbotService } from '../chatbot/chatbot.service';

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : true;

@WebSocketGateway({
  namespace: '/live-chat',
  cors: { origin: corsOrigins, credentials: true },
})
export class LiveHandoffGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(LiveHandoffGateway.name);

  constructor(
    @Inject(forwardRef(() => LiveHandoffService))
    private readonly liveHandoffService: LiveHandoffService,
    private readonly chatbotService: ChatbotService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  private room(sessionId: string): string {
    return `live-handoff:${sessionId}`;
  }

  @SubscribeMessage('join_session')
  async onJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string },
  ): Promise<void> {
    if (!body?.sessionId) return;
    await client.join(this.room(body.sessionId));
  }

  @SubscribeMessage('visitor_message')
  async onVisitorMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; text?: string },
  ): Promise<void> {
    const text = body?.text?.trim().slice(0, 1000);
    if (!body?.sessionId || !text) return;

    const status = await this.liveHandoffService.getStatus(body.sessionId);
    if (status.status !== 'live') return;

    const message = await this.chatbotService.appendLiveMessage(body.sessionId, 'user', text);
    this.server.to(this.room(body.sessionId)).emit('chat_message', {
      sessionId: body.sessionId,
      from: 'visitor',
      text,
      sentAt: message.timestamp,
    });
  }

  @SubscribeMessage('admin_join')
  async onAdminJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; token?: string },
  ): Promise<void> {
    const payload = this.verifyAdminToken(body?.token);
    if (!payload || !body?.sessionId) {
      client.emit('error', { message: 'Non autorizzato' });
      return;
    }

    const status = await this.liveHandoffService.markAgentJoining(body.sessionId);
    await client.join(this.room(status.sessionId));
    this.server.to(this.room(status.sessionId)).emit('agent_joined', {
      sessionId: status.sessionId,
      agentName: 'Gent',
      joinedAt: new Date(),
    });
    await this.liveHandoffService.markLive(status.sessionId);
  }

  @SubscribeMessage('admin_message')
  async onAdminMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; text?: string; token?: string },
  ): Promise<void> {
    const payload = this.verifyAdminToken(body?.token);
    const text = body?.text?.trim().slice(0, 2000);
    if (!payload || !body?.sessionId || !text) return;

    const message = await this.chatbotService.appendLiveMessage(body.sessionId, 'agent', text);
    this.server.to(this.room(body.sessionId)).emit('chat_message', {
      sessionId: body.sessionId,
      from: 'agent',
      text,
      sentAt: message.timestamp,
    });
  }

  @SubscribeMessage('admin_close')
  async onAdminClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string; token?: string },
  ): Promise<void> {
    const payload = this.verifyAdminToken(body?.token);
    if (!payload || !body?.sessionId) return;
    await this.liveHandoffService.closeSession(body.sessionId);
  }

  private verifyAdminToken(token?: string): unknown | null {
    if (!token) return null;
    try {
      return this.jwtService.verify(token);
    } catch {
      return null;
    }
  }

  emitStatusChanged(sessionId: string, status: string): void {
    this.server?.to(this.room(sessionId)).emit('handoff_status_changed', {
      sessionId,
      status,
      updatedAt: new Date(),
    });
  }
}
