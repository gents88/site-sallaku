import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Socket } from 'socket.io-client';
import { AuthService } from '../../../core/services/auth.service';
import { SOCKET_IO } from '../../../core/services/live-handoff.service';
import { AdminAttentionService } from '../../../core/services/admin-attention.service';
import { environment } from '../../../../environments/environment';

type LiveChatRole = 'user' | 'assistant' | 'agent';

interface LiveChatMessage {
  role: LiveChatRole;
  content: string;
  timestamp: Date;
}

const TYPING_VISIBLE_MS = 4_000;

type SessionStatus = 'connecting' | 'joining' | 'live' | 'expired' | 'closed' | 'error';

@Component({
  selector: 'app-admin-live-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './live-chat.component.html',
  styleUrl: './live-chat.component.scss',
})
export class AdminLiveChatComponent implements OnInit, OnDestroy {
  @ViewChild('log') private log?: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly io = inject(SOCKET_IO);
  private readonly attention = inject(AdminAttentionService);

  sessionId = '';
  messages: LiveChatMessage[] = [];
  status: SessionStatus = 'connecting';
  loadingHistory = true;
  inputText = '';
  /** Il visitatore sta scrivendo: si spegne da solo se non arrivano altri segnali. */
  visitorTyping = false;

  private typingTimer?: ReturnType<typeof setTimeout>;
  private socket: Socket | null = null;
  private connectErrorCount = 0;

  ngOnInit(): void {
    this.sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
    if (!this.sessionId) {
      this.status = 'error';
      return;
    }
    this.loadHistory();
    this.connect();
  }

  ngOnDestroy(): void {
    // Navigare via (es. "Torna alla dashboard") NON chiude più la chat: prima lo
    // faceva, e vanificava la card di rientro in dashboard — bastava dare
    // un'occhiata altrove per perdere la sessione. Chiudere è ora una scelta
    // esplicita, vedi closeChat().
    clearTimeout(this.typingTimer);
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Solo Gent può chiudere, e lo fa quando vuole: nessuna conferma richiesta. */
  closeChat(): void {
    // L'autorizzazione è quella dell'handshake: il token per-messaggio scadeva a metà chat.
    this.socket?.emit('admin_close', { sessionId: this.sessionId });
    this.status = 'closed';
    this.cdr.markForCheck();
  }

  private loadHistory(): void {
    this.http
      .get<{ messages: LiveChatMessage[] }>(`${environment.apiUrl}/chatbot/session/${this.sessionId}`)
      .subscribe({
        next: (session) => {
          this.messages = session.messages ?? [];
          this.loadingHistory = false;
          this.cdr.markForCheck();
          this.scrollToBottom();
        },
        error: () => {
          this.loadingHistory = false;
          this.cdr.markForCheck();
        },
      });
  }

  private connect(): void {
    const token = this.auth.getToken();
    if (!token) {
      this.status = 'error';
      return;
    }

    const wsOrigin = environment.apiUrl.replace(/\/api\/v\d+\/?$/, '');
    // Niente `transports: ['websocket']`: forzare solo WS salta l'handshake di polling
    // e su alcuni proxy/edge che parlano HTTP/2 (Railway compreso) l'upgrade diretto a
    // WS fallisce con 400 Bad Request. Il default (polling → tentativo di upgrade a WS)
    // funziona sempre almeno via polling, con eventuale upgrade opportunistico.
    // Il token viaggia nell'handshake e viene rinnovato se sta per scadere, anche a ogni
    // riconnessione (`auth` come funzione): con un token di accesso breve, quello letto
    // all'apertura della pagina sarebbe scaduto a metà conversazione e ogni messaggio dell'admin
    // verrebbe scartato dal server senza alcun errore.
    this.socket = this.io(`${wsOrigin}/live-chat`, {
      auth: (cb) => this.auth.getFreshToken().subscribe((fresh) => cb({ token: fresh })),
    });

    this.socket.on('connect', () => {
      this.connectErrorCount = 0;
      this.status = 'joining';
      this.cdr.markForCheck();
      this.socket?.emit('admin_join', { sessionId: this.sessionId });
    });

    // Se il WS non riesce proprio a connettersi (rete/proxy), non deve restare bloccato
    // in silenzio su "Connessione in corso": dopo qualche tentativo mostra un errore.
    this.socket.on('connect_error', () => {
      this.connectErrorCount += 1;
      if (this.connectErrorCount >= 3) {
        this.status = 'error';
        this.cdr.markForCheck();
      }
    });

    this.socket.on('agent_joined', () => {
      this.status = 'live';
      this.cdr.markForCheck();
    });

    this.socket.on('handoff_status_changed', (payload: { status: string }) => {
      if (payload.status === 'expired' || payload.status === 'closed') {
        this.status = payload.status;
        this.cdr.markForCheck();
      }
    });

    // Il visitatore manda un segnale ogni ~2,5 s mentre scrive: l'indicatore resta acceso un
    // po' più a lungo dell'intervallo e si spegne da solo quando smette.
    this.socket.on('typing', () => {
      this.visitorTyping = true;
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        this.visitorTyping = false;
        this.cdr.markForCheck();
      }, TYPING_VISIBLE_MS);
      this.cdr.markForCheck();
    });

    this.socket.on('chat_message', (payload: { from: 'visitor' | 'agent'; text: string; sentAt: string }) => {
      if (payload.from === 'visitor') {
        // Il messaggio è arrivato: l'indicatore non ha più senso. Se sei su un'altra scheda, avvisa.
        this.visitorTyping = false;
        clearTimeout(this.typingTimer);
        this.attention.notify();
      }
      this.messages = [
        ...this.messages,
        { role: payload.from === 'visitor' ? 'user' : 'agent', content: payload.text, timestamp: new Date(payload.sentAt) },
      ];
      this.cdr.markForCheck();
      this.scrollToBottom();
    });

    this.socket.on('error', () => {
      this.status = 'error';
      this.cdr.markForCheck();
    });

    this.socket.on('disconnect', () => {
      if (this.status === 'live') this.status = 'connecting';
      this.cdr.markForCheck();
    });
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || this.status !== 'live') return;
    this.socket?.emit('admin_message', { sessionId: this.sessionId, text });
    this.inputText = '';
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.log?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
