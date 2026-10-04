import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type AdminEventType = 'contact' | 'testimonial' | 'note' | 'live_handoff';

export interface AdminEvent {
  type: AdminEventType;
  at: string;
  /** Riga breve per il toast (oggetto del messaggio, nome, ...). Mai dati sensibili. */
  title?: string;
}

/**
 * Bus degli eventi per il campanello admin. I servizi di dominio chiamano
 * notify(); LiveHandoffGateway li inoltra via WebSocket alla stanza 'admins'.
 * Prima l'admin scopriva una chat live in attesa solo dall'email o dal
 * polling della dashboard.
 */
@Injectable()
export class AdminEventsService {
  private readonly subject = new Subject<AdminEvent>();
  readonly events$: Observable<AdminEvent> = this.subject.asObservable();

  notify(type: AdminEventType, title?: string): void {
    this.subject.next({ type, at: new Date().toISOString(), title: title?.slice(0, 120) });
  }
}
