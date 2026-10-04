import { Inject, Logger, OnModuleDestroy, Optional, forwardRef } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveHandoffService } from './live-handoff.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { isProductionEnv } from '../common/utils/runtime-env';
import { Subscription } from 'rxjs';
import { UsersService } from '../users/users.service';
import { AdminEventsService } from '../common/services/admin-events.service';

/** Stanza dei socket admin autenticati all'handshake: riceve gli eventi del campanello. */
export const ADMINS_ROOM = 'admins';

/**
 * Stati in cui la chat accetta messaggi. Include "agent_joining" di proposito: fra
 * l'ingresso di Gent e il passaggio a "live" c'è una finestra di pochi millisecondi,
 * e accettare solo "live" significava scartare in silenzio i messaggi scritti in quel
 * momento — o dopo qualunque disallineamento di stato.
 */
const CHATTABLE_STATUSES = ['agent_joining', 'live'];

// Stessa logica di validazione dell'Origin usata dal CORS HTTP in main.ts, così il
// comportamento è identico e verificato: nessuna cookie/credenziale sul socket (l'auth
// admin viaggia nel payload del messaggio), quindi niente `credentials: true` — che
// tra l'altro va in conflitto con un origin non esplicito e fa fallire l'handshake WS
// nel browser reale (visto solo lì, mai in un client Node "nudo" senza Origin header).
function corsOriginValidator(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }
  const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (!isProductionEnv() && allowedOrigins.length === 0) {
    callback(null, true);
    return;
  }
  callback(null, allowedOrigins.includes(origin));
}

@WebSocketGateway({
  namespace: '/live-chat',
  cors: { origin: corsOriginValidator },
})
export class LiveHandoffGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(LiveHandoffGateway.name);

  constructor(
    @Inject(forwardRef(() => LiveHandoffService))
    private readonly liveHandoffService: LiveHandoffService,
    private readonly chatbotService: ChatbotService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @Optional() private readonly adminEvents?: AdminEventsService,
  ) {}

  private eventsSub: Subscription | null = null;

  afterInit(): void {
    this.eventsSub = this.adminEvents?.events$.subscribe((event) => {
      this.server?.to(ADMINS_ROOM).emit('admin_notification', event);
    }) ?? null;
  }

  onModuleDestroy(): void {
    this.eventsSub?.unsubscribe();
  }

  /**
   * Autenticazione all'handshake (`io(url, { auth: { token } })`): un admin
   * verificato entra nella stanza 'admins' e non deve più allegare il token
   * a ogni messaggio. I visitatori si connettono senza token come prima.
   */
  async handleConnection(client: Socket): Promise<void> {
    this.logger.debug(`Client connected: ${client.id}`);
    const token = (client.handshake?.auth as { token?: unknown } | undefined)?.token;
    if (typeof token === 'string' && (await this.isAdminToken(token))) {
      client.data = { ...(client.data ?? {}), isAdmin: true };
      await client.join(ADMINS_ROOM);
    }
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
    if (!CHATTABLE_STATUSES.includes(status.status)) return;

    const message = await this.chatbotService.appendLiveMessage(body.sessionId, 'user', text);
    await this.liveHandoffService.touchActivity(body.sessionId);
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
    const authorized = await this.isAdmin(client, body?.token);
    if (!authorized || !body?.sessionId) {
      client.emit('error', { message: 'Non autorizzato' });
      return;
    }

    let status;
    try {
      status = await this.liveHandoffService.markAgentJoining(body.sessionId);
    } catch (err) {
      client.emit('error', {
        message: err instanceof Error ? err.message : 'Impossibile entrare in questa chat.',
      });
      return;
    }

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
    const authorized = await this.isAdmin(client, body?.token);
    const text = body?.text?.trim().slice(0, 2000);
    if (!authorized || !body?.sessionId || !text) return;

    const status = await this.liveHandoffService.getStatus(body.sessionId);
    if (!CHATTABLE_STATUSES.includes(status.status)) {
      // Meglio dirlo che sparire: un messaggio scartato in silenzio si manifesta come
      // "ho risposto ma il visitatore non riceve nulla", senza alcun indizio.
      client.emit('error', { message: 'La chat non è più attiva: il messaggio non è stato inviato.' });
      return;
    }

    const message = await this.chatbotService.appendLiveMessage(body.sessionId, 'agent', text);
    await this.liveHandoffService.touchActivity(body.sessionId);
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
    const authorized = await this.isAdmin(client, body?.token);
    if (!authorized || !body?.sessionId) return;
    await this.liveHandoffService.closeSession(body.sessionId);
  }

  /**
   * Chiusura deliberata da parte del visitatore (dopo conferma in UI). Nessuna auth:
   * stesso modello di fiducia di `visitor_message`/`join_session` — il sessionId stesso
   * è già la capability, non esiste un token lato visitatore.
   */
  @SubscribeMessage('visitor_close')
  async onVisitorClose(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { sessionId?: string },
  ): Promise<void> {
    if (!body?.sessionId) return;
    await this.liveHandoffService.closeSession(body.sessionId);
  }

  /** Socket già autenticato all'handshake, oppure token per-messaggio (client precedenti). */
  private async isAdmin(client: Socket, token?: string): Promise<boolean> {
    if (client.data?.isAdmin) return true;
    return token ? this.isAdminToken(token) : false;
  }

  /**
   * Firma valida NON basta: prima bastava un JWT qualsiasi, e con la
   * registrazione aperta un utente 'user' poteva entrare in una chat live
   * come "Gent", scrivere come agente e chiuderla. Il ruolo si legge dal DB
   * (come fa JwtStrategy), così un admin declassato perde subito l'accesso.
   */
  private async isAdminToken(token: string): Promise<boolean> {
    let sub: string | undefined;
    try {
      sub = (this.jwtService.verify(token) as { sub?: string })?.sub;
    } catch {
      return false;
    }
    if (!sub) return false;
    const user = await this.usersService.findById(sub);
    return user?.role === 'admin';
  }

  emitStatusChanged(sessionId: string, status: string): void {
    this.server?.to(this.room(sessionId)).emit('handoff_status_changed', {
      sessionId,
      status,
      updatedAt: new Date(),
    });
  }
}
