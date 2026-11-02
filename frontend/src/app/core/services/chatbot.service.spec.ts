import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatbotService } from './chatbot.service';
import { environment } from '@env/environment';

const MESSAGE_URL = `${environment.apiUrl}/chatbot/message`;

describe('ChatbotService', () => {
  let service: ChatbotService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ChatbotService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('espone i suggerimenti di follow-up ricevuti nella risposta', async () => {
    service.sendMessage('ciao');

    httpMock.expectOne(MESSAGE_URL).flush({
      sessionId: 's1',
      reply: 'Ciao! Come posso aiutarti?',
      timestamp: new Date().toISOString(),
      suggestions: ['Chi è Gent?', 'Che progetti ha fatto?'],
    });

    expect(await firstValueFrom(service.suggestions$)).toEqual(['Chi è Gent?', 'Che progetti ha fatto?']);
  });

  it('svuota i suggerimenti precedenti non appena parte un nuovo messaggio', async () => {
    service.sendMessage('prima domanda');
    httpMock.expectOne(MESSAGE_URL).flush({
      sessionId: 's1',
      reply: 'Risposta uno.',
      timestamp: new Date().toISOString(),
      suggestions: ['Suggerimento vecchio'],
    });
    expect(await firstValueFrom(service.suggestions$)).toEqual(['Suggerimento vecchio']);

    service.sendMessage('seconda domanda');

    // Svuotati subito all'invio, prima ancora che arrivi la risposta HTTP.
    expect(await firstValueFrom(service.suggestions$)).toEqual([]);
    httpMock.expectOne(MESSAGE_URL).flush({
      sessionId: 's1',
      reply: 'Risposta due.',
      timestamp: new Date().toISOString(),
    });
  });

  it('non lascia suggerimenti quando la risposta non ne include (percorso di fallback)', async () => {
    service.sendMessage('domanda');
    httpMock.expectOne(MESSAGE_URL).flush({
      sessionId: 's1',
      reply: 'Risposta di riserva.',
      timestamp: new Date().toISOString(),
    });

    expect(await firstValueFrom(service.suggestions$)).toEqual([]);
  });

  describe('cronologia dopo un ricaricamento della pagina', () => {
    /** Simula il reload: stessa sessionStorage, servizio nuovo. */
    function reload(): ChatbotService {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      httpMock = TestBed.inject(HttpTestingController);
      return TestBed.inject(ChatbotService);
    }

    function converse(): void {
      service.sendMessage('Quali progetti hai fatto?');
      httpMock.expectOne(MESSAGE_URL).flush({ sessionId: 'sess-1', reply: 'Ecco i principali…', timestamp: '2026-10-22T10:00:05.000Z', liveOffer: true });
    }

    it('la conversazione torna com\'era, con ruoli, testi e date', async () => {
      converse();

      const after = reload();
      const messages = await firstValueFrom(after.messages$);

      expect(messages.map((m) => [m.role, m.content])).toEqual([
        ['user', 'Quali progetti hai fatto?'],
        ['assistant', 'Ecco i principali…'],
      ]);
      expect(messages[1].timestamp).toBeInstanceOf(Date);
      expect(messages[1].timestamp.toISOString()).toBe('2026-10-22T10:00:05.000Z');
      expect(after.hasMessages).toBe(true);
      expect(after.currentSessionId).toBe('sess-1');
    });

    it('conserva anche l\'offerta di parlare con Gent', async () => {
      converse();

      const messages = await firstValueFrom(reload().messages$);

      expect(messages[1].liveOffer).toBe(true);
    });

    it('si può continuare a scrivere nella stessa sessione dopo il ricaricamento', () => {
      converse();
      const after = reload();

      after.sendMessage('E le competenze?');

      const req = httpMock.expectOne(MESSAGE_URL);
      expect(req.request.body.sessionId).toBe('sess-1');
      req.flush({ sessionId: 'sess-1', reply: 'Angular, NestJS…', timestamp: new Date().toISOString() });
    });

    it('i messaggi nuovi si aggiungono a quelli ripresi e restano dopo un secondo ricaricamento', async () => {
      converse();
      const second = reload();
      second.sendMessage('E le competenze?');
      httpMock.expectOne(MESSAGE_URL).flush({ sessionId: 'sess-1', reply: 'Angular, NestJS…', timestamp: new Date().toISOString() });

      const messages = await firstValueFrom(reload().messages$);

      expect(messages).toHaveLength(4);
      expect(messages[3].content).toBe('Angular, NestJS…');
    });

    it('cancellare la conversazione svuota anche la cronologia salvata', async () => {
      converse();

      service.clearSession();
      const messages = await firstValueFrom(reload().messages$);

      expect(messages).toEqual([]);
      expect(sessionStorage.getItem('chatbot_messages')).toBeNull();
    });

    it('messaggi salvati senza una sessione (conversazione già cancellata) non ricompaiono', async () => {
      sessionStorage.setItem('chatbot_messages', JSON.stringify([{ role: 'user', content: 'vecchio', timestamp: '2026-10-22T10:00:00.000Z' }]));

      const messages = await firstValueFrom(reload().messages$);

      expect(messages).toEqual([]);
    });

    it('una cronologia salvata corrotta non rompe la chat: riparte vuota', async () => {
      sessionStorage.setItem('chatbot_session_id', 'sess-1');
      sessionStorage.setItem('chatbot_messages', '{non json');

      const after = reload();

      expect(await firstValueFrom(after.messages$)).toEqual([]);
      expect(after.hasMessages).toBe(false);
    });
  });

  it('clearSession azzera anche i suggerimenti', async () => {
    service.sendMessage('domanda');
    httpMock.expectOne(MESSAGE_URL).flush({
      sessionId: 's1',
      reply: 'Risposta.',
      timestamp: new Date().toISOString(),
      suggestions: ['Uno', 'Due'],
    });
    expect(await firstValueFrom(service.suggestions$)).toEqual(['Uno', 'Due']);

    service.clearSession();

    expect(await firstValueFrom(service.suggestions$)).toEqual([]);
  });
});
