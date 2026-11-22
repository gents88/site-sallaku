import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    // I test qui sotto verificano il percorso HTTP; lo streaming ha la sua sezione in fondo.
    service.streaming = false;
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
      const reloaded = TestBed.inject(ChatbotService);
      reloaded.streaming = false;
      return reloaded;
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

  describe('risposta a pezzi (streaming)', () => {
    const STREAM_URL = `${environment.apiUrl}/chatbot/message/stream`;
    const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const DONE = {
      sessionId: 's9', reply: 'Usa Comprimi PDF.', timestamp: new Date().toISOString(),
      suggestions: ['Come firmo un PDF?'], liveOffer: true,
    };

    /** fetch finta: restituisce una risposta il cui corpo arriva nei pezzi dati. */
    function stubFetch(pieces: string[], status = 200): ReturnType<typeof vi.fn> {
      const enc = new TextEncoder();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: status === 200,
        status,
        body: new ReadableStream({
          start(controller) {
            pieces.forEach((p) => controller.enqueue(enc.encode(p)));
            controller.close();
          },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }
    const waitFor = async (cond: () => boolean) => {
      for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
    };
    const last = async () => (await firstValueFrom(service.messages$)).at(-1);

    beforeEach(() => {
      service.streaming = true;
    });
    afterEach(() => vi.unstubAllGlobals());

    it('mostra il testo man mano e alla fine lo sostituisce con il risultato pulito', async () => {
      const fetchMock = stubFetch([
        sse('delta', { t: 'Usa ' }),
        sse('delta', { t: 'Comprimi' }).slice(0, 30), // evento spezzato a metà fra due pezzi
        sse('delta', { t: 'Comprimi' }).slice(30) + sse('delta', { t: ' PDF.' }),
        sse('done', DONE),
      ]);

      service.sendMessage('come riduco un pdf?', 'it');
      await waitFor(() => !!service.currentSessionId);

      expect(fetchMock.mock.calls[0][0]).toBe(STREAM_URL);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ message: 'come riduco un pdf?', lang: 'it' });
      const msg = await last();
      expect(msg).toMatchObject({ role: 'assistant', content: 'Usa Comprimi PDF.', liveOffer: true });
      expect((await firstValueFrom(service.messages$)).map((m) => m.role)).toEqual(['user', 'assistant']);
      expect(await firstValueFrom(service.suggestions$)).toEqual(['Come firmo un PDF?']);
      expect(await firstValueFrom(service.isLoading$)).toBe(false);
      httpMock.expectNone(MESSAGE_URL);
    });

    it('i puntini di attesa spariscono al primo testo, non alla fine', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const enc = new TextEncoder();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, status: 200,
        body: new ReadableStream({
          async start(controller) {
            controller.enqueue(enc.encode(sse('delta', { t: 'Ciao' })));
            await gate;
            controller.enqueue(enc.encode(sse('done', DONE)));
            controller.close();
          },
        }),
      }));

      service.sendMessage('ciao');
      await waitFor(() => service['_messages'].getValue().length === 2);

      expect(await last()).toMatchObject({ role: 'assistant', content: 'Ciao' });
      expect(await firstValueFrom(service.isLoading$)).toBe(false);
      release();
      await waitFor(() => !!service.currentSessionId);
      expect((await last())?.content).toBe('Usa Comprimi PDF.');
    });

    it('se lo stream non parte (errore HTTP) ripiega sulla richiesta normale', async () => {
      stubFetch([], 404);

      service.sendMessage('ciao');
      await new Promise((r) => setTimeout(r, 20));
      const req = httpMock.expectOne(MESSAGE_URL);
      req.flush({ sessionId: 's1', reply: 'Risposta intera.', timestamp: new Date().toISOString() });

      expect((await last())?.content).toBe('Risposta intera.');
    });

    it('un evento di errore prima del testo ripiega sulla richiesta normale', async () => {
      stubFetch([sse('error', { message: 'boom' })]);

      service.sendMessage('ciao');
      await new Promise((r) => setTimeout(r, 30));

      httpMock.expectOne(MESSAGE_URL).flush({ sessionId: 's1', reply: 'Ok dal normale.', timestamp: new Date().toISOString() });
      expect((await last())?.content).toBe('Ok dal normale.');
    });

    it('se si interrompe dopo aver mostrato del testo, lo tiene e non rifà la richiesta', async () => {
      stubFetch([sse('delta', { t: 'Risposta a metà' }), sse('error', { message: 'connessione persa' })]);

      service.sendMessage('ciao');
      await waitFor(() => service['_messages'].getValue().length === 2);
      await new Promise((r) => setTimeout(r, 120));

      expect((await last())?.content).toBe('Risposta a metà');
      expect(await firstValueFrom(service.isLoading$)).toBe(false);
      httpMock.expectNone(MESSAGE_URL);
    });

    it('cancellare la chat durante lo stream non scrive nella conversazione nuova', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const enc = new TextEncoder();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, status: 200,
        body: new ReadableStream({
          async start(controller) {
            await gate;
            controller.enqueue(enc.encode(sse('delta', { t: 'tardivo' }) + sse('done', DONE)));
            controller.close();
          },
        }),
      }));

      service.sendMessage('ciao');
      service.clearSession();
      release();
      await new Promise((r) => setTimeout(r, 60));

      expect(await firstValueFrom(service.messages$)).toEqual([]);
    });
  });
});
