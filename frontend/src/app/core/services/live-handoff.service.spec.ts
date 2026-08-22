import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveHandoffService } from './live-handoff.service';
import { environment } from '@env/environment';

type Handler = (payload?: unknown) => void;

class MockSocket {
  private readonly handlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; payload: unknown }[] = [];
  readonly disconnect = vi.fn();

  on(event: string, cb: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
  }

  emit(event: string, payload?: unknown): void {
    this.emitted.push({ event, payload });
  }

  trigger(event: string, payload?: unknown): void {
    (this.handlers.get(event) ?? []).forEach((cb) => cb(payload));
  }
}

let lastSocket: MockSocket | undefined;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    lastSocket = new MockSocket();
    return lastSocket;
  }),
}));

const HANDOFF_URL = `${environment.apiUrl}/chatbot/s1/live-handoff`;

function flushSuccessfulRequest(httpMock: HttpTestingController): void {
  const req = httpMock.expectOne(HANDOFF_URL);
  req.flush({ status: 'requested', expiresAt: new Date().toISOString() });
}

describe('LiveHandoffService', () => {
  let service: LiveHandoffService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    lastSocket = undefined;
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LiveHandoffService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('notifyTyping', () => {
    it('non mostra il banner se non c’è ancora stato uno scambio di messaggi', () => {
      service.notifyTyping('s1', false);
      expect(service.state).toBe('idle');
    });

    it('mostra il banner quando l’utente digita dopo aver già scambiato messaggi', () => {
      service.notifyTyping('s1', true);
      expect(service.state).toBe('prompt_shown');
    });

    it('non ri-mostra il banner entro il cooldown dopo un dismiss', () => {
      service.notifyTyping('s1', true);
      service.dismissPrompt('s1');
      expect(service.state).toBe('idle');

      service.notifyTyping('s1', true);
      expect(service.state).toBe('idle');
    });

    it('non fa nulla se il banner è già mostrato (niente doppio timer)', () => {
      service.notifyTyping('s1', true);
      service.notifyTyping('s1', true);
      expect(service.state).toBe('prompt_shown');
    });

    it('si auto-minimizza in una pillola dopo 8s se ignorato', () => {
      vi.useFakeTimers();
      try {
        service.notifyTyping('s1', true);
        let minimized: boolean | undefined;
        service.minimized$.subscribe((m) => (minimized = m));
        expect(minimized).toBe(false);

        vi.advanceTimersByTime(8000);
        expect(minimized).toBe(true);
        expect(service.state).toBe('prompt_shown');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('reopenPrompt', () => {
    it('annulla la minimizzazione quando il banner è ancora mostrato', () => {
      service.notifyTyping('s1', true);
      let minimized: boolean | undefined;
      service.minimized$.subscribe((m) => (minimized = m));

      service.reopenPrompt();
      expect(minimized).toBe(false);
      expect(service.state).toBe('prompt_shown');
    });

    it('non fa nulla se il banner non è più mostrato', () => {
      service.reopenPrompt();
      expect(service.state).toBe('idle');
    });
  });

  describe('dismissPrompt su uno stato non "prompt_shown"', () => {
    it('registra comunque il cooldown senza cambiare stato', () => {
      // Nessun notifyTyping prima: lo stato resta idle.
      service.dismissPrompt('s1');
      expect(service.state).toBe('idle');

      // Il cooldown deve comunque essere stato registrato.
      service.notifyTyping('s1', true);
      expect(service.state).toBe('idle');
    });
  });

  describe('requestHandoff', () => {
    it('invia la richiesta POST corretta e passa subito a "request_sent"', () => {
      service.requestHandoff('s1', 'ciao Gent', 'it');
      expect(service.state).toBe('request_sent');

      const req = httpMock.expectOne(HANDOFF_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ locale: 'it', lastUserMessage: 'ciao Gent' });
      req.flush({ status: 'requested', expiresAt: new Date().toISOString() });
    });

    it('torna a "idle" se la richiesta fallisce', () => {
      service.requestHandoff('s1', 'ciao', 'it');
      const req = httpMock.expectOne(HANDOFF_URL);
      req.flush({ message: 'errore' }, { status: 500, statusText: 'Server Error' });

      expect(service.state).toBe('idle');
    });

    it('apre il socket e si unisce alla room della sessione dopo la conferma', () => {
      service.requestHandoff('s1', 'ciao', 'it');
      flushSuccessfulRequest(httpMock);

      lastSocket!.trigger('connect');

      expect(lastSocket!.emitted).toContainEqual({ event: 'join_session', payload: { sessionId: 's1' } });
    });
  });

  describe('eventi in arrivo dal socket', () => {
    beforeEach(() => {
      service.requestHandoff('s1', 'ciao', 'it');
      flushSuccessfulRequest(httpMock);
    });

    it('passa a "agent_joining" quando Gent entra in chat', () => {
      lastSocket!.trigger('agent_joined');
      expect(service.state).toBe('agent_joining');
    });

    it('passa a "live" quando arriva handoff_status_changed con status live', () => {
      lastSocket!.trigger('handoff_status_changed', { status: 'live' });
      expect(service.state).toBe('live');
    });

    it('accoda i messaggi live ricevuti mantenendo il mittente', () => {
      let latest: unknown[] = [];
      service.liveMessages$.subscribe((msgs) => (latest = msgs));

      lastSocket!.trigger('chat_message', { from: 'agent', text: 'Ciao, sono Gent', sentAt: new Date().toISOString() });

      expect(latest).toHaveLength(1);
      expect((latest[0] as { from: string; text: string }).from).toBe('agent');
      expect((latest[0] as { from: string; text: string }).text).toBe('Ciao, sono Gent');
    });

    it('passa a "expired" e disconnette il socket allo scadere della richiesta', () => {
      lastSocket!.trigger('handoff_status_changed', { status: 'expired' });

      expect(service.state).toBe('expired');
      expect(lastSocket!.disconnect).toHaveBeenCalled();
    });

    it('passa a "closed" e disconnette il socket quando Gent chiude la sessione', () => {
      lastSocket!.trigger('handoff_status_changed', { status: 'closed' });

      expect(service.state).toBe('closed');
      expect(lastSocket!.disconnect).toHaveBeenCalled();
    });

    it('ignora uno status "notified" sconosciuto al client senza cambiare stato', () => {
      lastSocket!.trigger('handoff_status_changed', { status: 'notified' });

      expect(service.state).toBe('request_sent');
    });
  });

  describe('sendLiveMessage', () => {
    it('non invia nulla finché lo stato non è "live"', () => {
      service.requestHandoff('s1', 'ciao', 'it');
      flushSuccessfulRequest(httpMock);

      service.sendLiveMessage('troppo presto');

      expect(lastSocket!.emitted.some((e) => e.event === 'visitor_message')).toBe(false);
    });

    it('invia il messaggio via socket una volta live', () => {
      service.requestHandoff('s1', 'ciao', 'it');
      flushSuccessfulRequest(httpMock);
      lastSocket!.trigger('handoff_status_changed', { status: 'live' });

      service.sendLiveMessage('ora sì');

      expect(lastSocket!.emitted).toContainEqual({
        event: 'visitor_message',
        payload: { sessionId: 's1', text: 'ora sì' },
      });
    });
  });

  describe('reset', () => {
    it('riporta tutto a "idle" e svuota i messaggi live', () => {
      service.requestHandoff('s1', 'ciao', 'it');
      flushSuccessfulRequest(httpMock);
      lastSocket!.trigger('handoff_status_changed', { status: 'live' });

      service.reset();

      expect(service.state).toBe('idle');
      expect(lastSocket!.disconnect).toHaveBeenCalled();
    });
  });
});
