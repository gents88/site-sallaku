import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export type LiveHandoffState =
  | 'idle'
  | 'prompt_shown'
  | 'request_sent'
  | 'agent_joining'
  | 'live'
  | 'expired'
  | 'closed';

export interface LiveHandoffMessage {
  from: 'visitor' | 'agent';
  text: string;
  sentAt: Date;
}

const DISMISS_COOLDOWN_MS = 10 * 60_000;
const AUTO_MINIMIZE_MS = 8_000;
const DISMISS_KEY_PREFIX = 'live_handoff_dismissed_';

@Injectable({ providedIn: 'root' })
export class LiveHandoffService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/chatbot`;
  private readonly wsOrigin = environment.apiUrl.replace(/\/api\/v\d+\/?$/, '');

  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private minimizeTimer?: ReturnType<typeof setTimeout>;

  private readonly _state = new BehaviorSubject<LiveHandoffState>('idle');
  readonly state$: Observable<LiveHandoffState> = this._state.asObservable();

  private readonly _minimized = new BehaviorSubject<boolean>(false);
  readonly minimized$: Observable<boolean> = this._minimized.asObservable();

  private readonly _liveMessages = new BehaviorSubject<LiveHandoffMessage[]>([]);
  readonly liveMessages$: Observable<LiveHandoffMessage[]> = this._liveMessages.asObservable();

  get state(): LiveHandoffState {
    return this._state.getValue();
  }

  /** Chiamato (con debounce) dal componente chat ad ogni digitazione dell'utente */
  notifyTyping(sessionId: string, hasExchangedMessages: boolean): void {
    if (!sessionId || !hasExchangedMessages) return;
    if (this.state !== 'idle') return;
    if (this.isDismissedRecently(sessionId)) return;

    this._minimized.next(false);
    this._state.next('prompt_shown');
    this.armAutoMinimize();
  }

  reopenPrompt(): void {
    if (this.state !== 'prompt_shown') return;
    this._minimized.next(false);
    this.clearMinimizeTimer();
  }

  dismissPrompt(sessionId: string): void {
    if (this.state === 'prompt_shown') {
      this._state.next('idle');
      this._minimized.next(false);
    }
    this.clearMinimizeTimer();
    this.setDismissed(sessionId);
  }

  requestHandoff(sessionId: string, lastUserMessage: string, locale: string): void {
    this.clearMinimizeTimer();
    this.sessionId = sessionId;
    this._state.next('request_sent');

    this.http
      .post<{ status: string; expiresAt: string }>(`${this.apiUrl}/${sessionId}/live-handoff`, {
        locale,
        lastUserMessage: lastUserMessage?.slice(0, 500),
      })
      .subscribe({
        next: () => this.connectSocket(sessionId),
        error: () => this._state.next('idle'),
      });
  }

  sendLiveMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.socket || !this.sessionId || this.state !== 'live') return;
    this.socket.emit('visitor_message', { sessionId: this.sessionId, text: trimmed });
  }

  /** Torna allo stato "idle": usato quando l'utente cancella la conversazione */
  reset(): void {
    this.disconnectSocket();
    this.sessionId = null;
    this._state.next('idle');
    this._minimized.next(false);
    this._liveMessages.next([]);
  }

  private connectSocket(sessionId: string): void {
    this.socket = io(`${this.wsOrigin}/live-chat`, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      this.socket?.emit('join_session', { sessionId });
    });

    this.socket.on('handoff_status_changed', (payload: { status: LiveHandoffState | 'notified' | 'none' }) => {
      this.applyStatus(payload.status);
    });

    this.socket.on('agent_joined', () => {
      this._state.next('agent_joining');
    });

    this.socket.on('chat_message', (payload: { from: 'visitor' | 'agent'; text: string; sentAt: string }) => {
      this._liveMessages.next([
        ...this._liveMessages.getValue(),
        { from: payload.from, text: payload.text, sentAt: new Date(payload.sentAt) },
      ]);
    });
  }

  private applyStatus(status: string): void {
    switch (status) {
      case 'agent_joining':
        this._state.next('agent_joining');
        break;
      case 'live':
        this._state.next('live');
        break;
      case 'expired':
        this._state.next('expired');
        this.disconnectSocket();
        break;
      case 'closed':
        this._state.next('closed');
        this.disconnectSocket();
        break;
      default:
        break;
    }
  }

  private disconnectSocket(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  private armAutoMinimize(): void {
    this.clearMinimizeTimer();
    this.minimizeTimer = setTimeout(() => {
      if (this.state === 'prompt_shown') this._minimized.next(true);
    }, AUTO_MINIMIZE_MS);
  }

  private clearMinimizeTimer(): void {
    if (this.minimizeTimer) clearTimeout(this.minimizeTimer);
  }

  private isDismissedRecently(sessionId: string): boolean {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY_PREFIX + sessionId);
      if (!raw) return false;
      return Date.now() - Number(raw) < DISMISS_COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  private setDismissed(sessionId: string): void {
    try {
      sessionStorage.setItem(DISMISS_KEY_PREFIX + sessionId, String(Date.now()));
    } catch {
      // sessionStorage non disponibile (SSR/privacy mode) — il cooldown è solo un miglioramento UX, non critico
    }
  }
}
