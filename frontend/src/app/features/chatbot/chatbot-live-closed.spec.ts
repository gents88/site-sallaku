import { importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatbotComponent } from './chatbot.component';
import { ChatbotService } from '../../core/services/chatbot.service';
import { LiveHandoffService } from '../../core/services/live-handoff.service';
import { LanguageService } from '../../core/services/language.service';

/**
 * Quando Gent chiude la chat live (o la richiesta scade) il visitatore deve
 * accorgersene: l'avviso sta in fondo alla conversazione, quindi serve lo scroll,
 * e a pannello chiuso serve il segnale di "non letto" come per i messaggi di Gent.
 */
describe('ChatbotComponent — chiusura della chat live', () => {
  let liveState$: BehaviorSubject<string>;

  function create(open: boolean): ComponentFixture<ChatbotComponent> {
    liveState$ = new BehaviorSubject<string>('live');
    const mockChatbot = {
      messages$: new BehaviorSubject([]),
      isLoading$: new BehaviorSubject(false),
      isOpen$: new BehaviorSubject(open),
      suggestions$: new BehaviorSubject([]),
      currentSessionId: 's1',
      hasMessages: false,
      close: vi.fn(),
      toggleOpen: vi.fn(),
      clearSession: vi.fn(),
      sendMessage: vi.fn(),
      sendTranscript: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: ChatbotService, useValue: mockChatbot },
        {
          provide: LiveHandoffService,
          useValue: {
            state$: liveState$,
            minimized$: new BehaviorSubject(false),
            liveMessages$: new BehaviorSubject([]),
            closeByVisitor: vi.fn(),
            reset: vi.fn(),
            notifyTyping: vi.fn(),
          },
        },
        { provide: LanguageService, useValue: { current: () => 'it' } },
      ],
    });
    const fixture = TestBed.createComponent(ChatbotComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('a pannello chiuso, la chiusura da parte di Gent conta come non letto', () => {
    const fixture = create(false);
    expect(fixture.componentInstance.badgeCount).toBe(0);

    liveState$.next('closed');
    fixture.detectChanges();

    expect(fixture.componentInstance.badgeCount).toBe(1);
  });

  it('a pannello chiuso, anche la richiesta scaduta conta come non letta', () => {
    const fixture = create(false);

    liveState$.next('expired');
    fixture.detectChanges();

    expect(fixture.componentInstance.badgeCount).toBe(1);
  });

  it('lo stesso stato ripetuto (socket + polling) si conta una volta sola', () => {
    const fixture = create(false);

    liveState$.next('closed');
    liveState$.next('closed');
    liveState$.next('closed');
    fixture.detectChanges();

    expect(fixture.componentInstance.badgeCount).toBe(1);
  });

  it('a pannello aperto mostra l\'avviso di chiusura e scorre in fondo per renderlo visibile', () => {
    const fixture = create(true);
    const scroll = vi.spyOn(fixture.componentInstance as unknown as { scrollToBottom(): void }, 'scrollToBottom');

    liveState$.next('closed');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.cb-system-notice')).toBeTruthy();
    expect(fixture.componentInstance.badgeCount).toBe(0);
    expect(scroll).toHaveBeenCalled();
  });

  it('gli altri cambi di stato non toccano il contatore dei non letti', () => {
    const fixture = create(false);

    liveState$.next('agent_joining');
    liveState$.next('live');
    fixture.detectChanges();

    expect(fixture.componentInstance.badgeCount).toBe(0);
  });
});
