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
