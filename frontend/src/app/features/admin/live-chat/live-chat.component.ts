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
import { Socket, io } from 'socket.io-client';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

type LiveChatRole = 'user' | 'assistant' | 'agent';

interface LiveChatMessage {
  role: LiveChatRole;
  content: string;
  timestamp: Date;
}

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

  sessionId = '';
  messages: LiveChatMessage[] = [];
  status: SessionStatus = 'connecting';
  loadingHistory = true;
  inputText = '';

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
    const token = this.auth.getToken();
    if (this.socket && token) {
      this.socket.emit('admin_close', { sessionId: this.sessionId, token });
    }
    this.socket?.disconnect();
    this.socket = null;
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
    this.socket = io(`${wsOrigin}/live-chat`, { transports: ['websocket'] });

    this.socket.on('connect', () => {
      this.connectErrorCount = 0;
      this.status = 'joining';
      this.cdr.markForCheck();
      this.socket?.emit('admin_join', { sessionId: this.sessionId, token });
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

    this.socket.on('chat_message', (payload: { from: 'visitor' | 'agent'; text: string; sentAt: string }) => {
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
    const token = this.auth.getToken();
    if (!text || !token || this.status !== 'live') return;
    this.socket?.emit('admin_message', { sessionId: this.sessionId, text, token });
    this.inputText = '';
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.log?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
