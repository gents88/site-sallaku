import { importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLiveChatComponent } from './live-chat.component';
import { AuthService } from '../../../core/services/auth.service';
import { SOCKET_IO } from '../../../core/services/live-handoff.service';
import { AdminAttentionService } from '../../../core/services/admin-attention.service';
import { environment } from '../../../../environments/environment';

type Handler = (payload?: unknown) => void;

class FakeSocket {
  private readonly handlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; payload: unknown }[] = [];
  readonly disconnect = vi.fn();

  on(event: string, cb: Handler): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
  }
  emit(event: string, payload?: unknown): void {
    this.emitted.push({ event, payload });
  }
  fire(event: string, payload?: unknown): void {
    (this.handlers.get(event) ?? []).forEach((cb) => cb(payload));
  }
}

const SID = 'session-0001';

describe('AdminLiveChatComponent — autenticazione del socket', () => {
  let socket: FakeSocket;
  let socketOpts: { auth: (cb: (data: object) => void) => void } | undefined;
  let token: string | null;
  let freshToken: ReturnType<typeof vi.fn>;
  let socketFactory: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;

  function create(): ComponentFixture<AdminLiveChatComponent> {
    socket = new FakeSocket();
    freshToken = vi.fn(() => of('token-fresco'));
    notify = vi.fn();
    socketFactory = vi.fn((_url: string, opts: typeof socketOpts) => {
      socketOpts = opts;
      return socket;
    });
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => SID } } } },
        { provide: AuthService, useValue: { getToken: () => token, getFreshToken: freshToken } },
        { provide: SOCKET_IO, useValue: socketFactory },
        { provide: AdminAttentionService, useValue: { notify } },
      ],
    });
    const fixture = TestBed.createComponent(AdminLiveChatComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/chatbot/session/${SID}`).flush({ messages: [] });
    return fixture;
  }

  beforeEach(() => {
    token = 'token-vecchio';
    socketOpts = undefined;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('manda il token nell\'handshake come funzione, ottenendolo fresco a ogni connessione', () => {
    create();
    const cb = vi.fn();

    socketOpts!.auth(cb);

    expect(freshToken).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith({ token: 'token-fresco' });
  });

  it('alla connessione entra nella sessione senza allegare un token al messaggio', () => {
    const fixture = create();

    socket.fire('connect');

    expect(socket.emitted).toContainEqual({ event: 'admin_join', payload: { sessionId: SID } });
    expect(fixture.componentInstance.status).toBe('joining');
  });

  it('i messaggi dell\'admin non portano il token: scadrebbe a metà conversazione', () => {
    const fixture = create();
    socket.fire('connect');
    socket.fire('agent_joined');
    fixture.componentInstance.inputText = 'ciao!';

    fixture.componentInstance.send();

    expect(socket.emitted).toContainEqual({ event: 'admin_message', payload: { sessionId: SID, text: 'ciao!' } });
    expect(JSON.stringify(socket.emitted)).not.toContain('token');
  });

  it('non invia messaggi vuoti né quando la chat non è live', () => {
    const fixture = create();
    fixture.componentInstance.inputText = 'ciao';
    fixture.componentInstance.send(); // ancora "connecting"
    socket.fire('agent_joined');
    fixture.componentInstance.inputText = '   ';
    fixture.componentInstance.send();

    expect(socket.emitted.filter((e) => e.event === 'admin_message')).toHaveLength(0);
  });

  it('chiudere la chat invia admin_close senza token e segna la sessione chiusa', () => {
    const fixture = create();

    fixture.componentInstance.closeChat();

    expect(socket.emitted).toContainEqual({ event: 'admin_close', payload: { sessionId: SID } });
    expect(JSON.stringify(socket.emitted)).not.toContain('token');
    expect(fixture.componentInstance.status).toBe('closed');
  });

  it('segue lo stato "closed" deciso dal server', () => {
    const fixture = create();

    socket.fire('handoff_status_changed', { status: 'closed' });

    expect(fixture.componentInstance.status).toBe('closed');
  });

  it('senza sessione admin non apre nessun socket e mostra l\'errore', () => {
    token = null;
    const fixture = create();

    expect(fixture.componentInstance.status).toBe('error');
    expect(socketFactory).not.toHaveBeenCalled();
  });

  describe('etichette dei messaggi', () => {
    const labels = (f: ComponentFixture<AdminLiveChatComponent>) =>
      Array.from((f.nativeElement as HTMLElement).querySelectorAll('.alc-msg__label')).map((el) => el.textContent?.trim());

    it('usa le chiavi di traduzione per visitatore e AI, non testo italiano fisso', () => {
      const fixture = create();
      const at = new Date();
      fixture.componentInstance.messages = [
        { role: 'user', content: 'ciao', timestamp: at },
        { role: 'assistant', content: 'risposta del bot', timestamp: new Date(at.getTime() + 1) },
      ];
      fixture.detectChanges();

      expect(labels(fixture)).toEqual(['live_handoff.admin_role_visitor', 'live_handoff.admin_role_ai']);
    });

    it('i messaggi di Gent mostrano il suo nome', () => {
      const fixture = create();
      socket.fire('chat_message', { from: 'agent', text: 'eccomi', sentAt: new Date().toISOString() });
      fixture.detectChanges();

      expect(labels(fixture)).toEqual(['Gent']);
    });
  });

  describe('segnali per l\'admin', () => {
    afterEach(() => vi.useRealTimers());

    const visitorMsg = { from: 'visitor', text: 'sei lì?', sentAt: new Date().toISOString() };
    const typingEl = (f: ComponentFixture<AdminLiveChatComponent>) =>
      (f.nativeElement as HTMLElement).querySelector('.alc-typing') as HTMLElement;

    it('mostra "sta scrivendo" quando il visitatore digita', () => {
      const fixture = create();
      expect(typingEl(fixture).textContent?.trim()).toBe('');

      socket.fire('typing', { sessionId: SID, from: 'visitor' });
      fixture.detectChanges();

      expect(typingEl(fixture).textContent).toContain('live_handoff.admin_visitor_typing');
    });

    it('lo spegne da solo dopo 4 secondi senza nuovi segnali', () => {
      vi.useFakeTimers();
      const fixture = create();
      socket.fire('typing');
      vi.advanceTimersByTime(3_900);
      expect(fixture.componentInstance.visitorTyping).toBe(true);

      vi.advanceTimersByTime(200);

      expect(fixture.componentInstance.visitorTyping).toBe(false);
    });

    it('un nuovo segnale prolunga l\'indicatore', () => {
      vi.useFakeTimers();
      const fixture = create();
      socket.fire('typing');
      vi.advanceTimersByTime(3_000);
      socket.fire('typing');
      vi.advanceTimersByTime(3_000);

      expect(fixture.componentInstance.visitorTyping).toBe(true);
    });

    it('quando il messaggio arriva l\'indicatore sparisce e l\'admin viene avvisato', () => {
      const fixture = create();
      socket.fire('typing');

      socket.fire('chat_message', visitorMsg);

      expect(fixture.componentInstance.visitorTyping).toBe(false);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(fixture.componentInstance.messages).toHaveLength(1);
    });

    it('i messaggi scritti da Gent non avvisano nessuno', () => {
      create();

      socket.fire('chat_message', { from: 'agent', text: 'ciao', sentAt: new Date().toISOString() });

      expect(notify).not.toHaveBeenCalled();
    });
  });
});
