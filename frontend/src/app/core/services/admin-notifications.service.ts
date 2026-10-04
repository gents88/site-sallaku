import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type AdminEventType = 'contact' | 'testimonial' | 'note' | 'live_handoff';

export interface AdminNotification {
  type: AdminEventType;
  at: string;
  title?: string;
}

export interface NotificationSummary {
  contactsUnread: number;
  testimonialsPending: number;
  notesPending: number;
  liveHandoffsWaiting: number;
}

/** Iniettabile per i test: in produzione è `io()` di socket.io-client. */
export const ADMIN_SOCKET_FACTORY = new InjectionToken<(url: string, opts: Partial<ManagerOptions & SocketOptions>) => Socket>(
  'ADMIN_SOCKET_FACTORY',
  { providedIn: 'root', factory: () => (url, opts) => io(url, opts) },
);

const EMPTY: NotificationSummary = { contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 };
const MAX_RECENT = 10;

/**
 * Campanello admin: contatori di ciò che aspetta un'azione + eventi in tempo
 * reale via WebSocket (autenticazione all'handshake, stanza 'admins').
 * Attivo solo per un admin loggato, nel browser; si disconnette al logout.
 * Il conteggio compare anche nel titolo della scheda, così una chat live in
 * attesa si nota anche con la dashboard in background.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly socketFactory = inject(ADMIN_SOCKET_FACTORY);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Acceso da init() (AppComponent, solo browser): gli effect esistono già ma restano inerti. */
  private readonly enabled = signal(false);

  readonly summary = signal<NotificationSummary>(EMPTY);
  readonly recent = signal<AdminNotification[]>([]);
  readonly connected = signal(false);
  readonly total = computed(() => {
    const s = this.summary();
    return s.contactsUnread + s.testimonialsPending + s.notesPending + s.liveHandoffsWaiting;
  });

  private readonly wsOrigin = environment.apiUrl.replace(/\/api\/v\d+\/?$/, '');
  private socket: Socket | null = null;

  constructor() {
    effect(() => {
      if (!this.enabled()) return;
      const admin = this.auth.isLoggedIn() && this.auth.isAdmin();
      if (admin) this.start();
      else this.stop();
    });
    effect(() => {
      if (this.enabled()) this.updateTitle(this.total());
    });
    // SeoService riscrive il <title> a ogni navigazione: il prefisso "(n)" va riapplicato.
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      if (this.enabled()) setTimeout(() => this.updateTitle(this.total()));
    });
  }

  init(): void {
    if (this.isBrowser) this.enabled.set(true);
  }

  refresh(): void {
    this.http.get<NotificationSummary>(`${environment.apiUrl}/stats/notifications`).subscribe({
      next: s => this.summary.set(s),
      error: () => { /* il campanello resta sull'ultimo valore noto */ },
    });
  }

  private start(): void {
    this.refresh();
    if (this.socket) return;
    const token = this.auth.getToken();
    this.socket = this.socketFactory(`${this.wsOrigin}/live-chat`, { auth: { token } });
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('admin_notification', (event: AdminNotification) => {
      this.recent.update(list => [event, ...list].slice(0, MAX_RECENT));
      this.refresh();
    });
  }

  private stop(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    this.summary.set(EMPTY);
    this.recent.set([]);
  }

  private updateTitle(total: number): void {
    const base = this.document.title.replace(/^\(\d+\)\s*/, '');
    this.document.title = total > 0 ? `(${total}) ${base}` : base;
  }
}
