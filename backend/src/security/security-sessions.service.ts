import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ClientContext, SecurityService } from './security.service';

/** Chiusura di una sessione da parte dell'admin: stesse regole di /users/:id/revoke-sessions, più traccia nel registro. */
@Injectable()
export class SecuritySessionsService {
  constructor(
    private readonly users: UsersService,
    private readonly security: SecurityService,
  ) {}

  async revoke(actorId: string, targetId: string, ctx: ClientContext): Promise<void> {
    // Lancia se è sé stessi (c'è il logout) o se l'utente non esiste.
    await this.users.revokeSessions(actorId, targetId);
    await this.security.endAllSessions(targetId);
    await this.security.record('session_revoked', ctx, { userId: targetId, detail: `chiusa da ${actorId}` });
  }

  /**
   * Chiude un solo dispositivo. Si può chiudere un'altra sessione anche del proprio account
   * (es. il telefono dimenticato acceso), ma non quella da cui si sta lavorando: per quella c'è il logout.
   */
  async revokeOne(actorId: string, actorSid: string | undefined, targetId: string, sessionId: string, ctx: ClientContext): Promise<void> {
    if (actorId === targetId && actorSid === sessionId) {
      throw new BadRequestException('Use logout to end your own session');
    }
    await this.security.endSession(targetId, sessionId);
    await this.security.record('session_revoked', ctx, { userId: targetId, detail: `un dispositivo chiuso da ${actorId}` });
  }
}
