import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatbotComponent } from './chatbot.component';
import { ChatbotService } from '../../core/services/chatbot.service';
import { LiveHandoffService } from '../../core/services/live-handoff.service';
import { LanguageService } from '../../core/services/language.service';

/**
 * Chiudere il pannello o cancellare la conversazione mentre si sta parlando con Gent
 * non può essere un gesto a caso: prima di chiamare chatbot.close()/clearChat() ci deve
 * essere sempre la conferma dell'utente. Questi test coprono la state machine reale del
 * componente (requestClose/requestClear + i tre esiti del dialog), non una copia.
 */
describe('ChatbotComponent — conferma di chiusura durante una chat live', () => {
  let component: ChatbotComponent;
  let mockChatbot: any;
  let mockLiveHandoff: any;

  beforeEach(() => {
    mockChatbot = {
      messages$: new BehaviorSubject([]),
      isLoading$: new BehaviorSubject(false),
      isOpen$: new BehaviorSubject(true),
      suggestions$: new BehaviorSubject([]),
      currentSessionId: 's1',
      hasMessages: true,
      close: vi.fn(),
      clearSession: vi.fn(),
      sendMessage: vi.fn(),
      sendTranscript: vi.fn(),
    };
    mockLiveHandoff = {
      state$: new BehaviorSubject('idle'),
      minimized$: new BehaviorSubject(false),
      liveMessages$: new BehaviorSubject([]),
      closeByVisitor: vi.fn(),
      reset: vi.fn(),
      notifyTyping: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: ChatbotService, useValue: mockChatbot },
        { provide: LiveHandoffService, useValue: mockLiveHandoff },
        { provide: LanguageService, useValue: { current: () => 'it' } },
      ],
    });

    const fixture = TestBed.createComponent(ChatbotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function setLiveState(state: string): void {
    (mockLiveHandoff.state$ as BehaviorSubject<string>).next(state);
  }

  describe('requestClose', () => {
    it('fuori da una chat live chiude subito, senza chiedere nulla', () => {
      setLiveState('idle');

      component.requestClose();

      expect(mockChatbot.close).toHaveBeenCalled();
      expect(component.exitConfirmStep).toBe('none');
    });

    it('durante una chat live NON chiude subito: apre il dialog di conferma', () => {
      setLiveState('live');

      component.requestClose();

      expect(mockChatbot.close).not.toHaveBeenCalled();
      expect(component.exitConfirmStep).toBe('ask_resolved');
    });
  });

  describe('requestClear', () => {
    it('fuori da una chat live cancella subito', () => {
      setLiveState('idle');

      component.requestClear();

      expect(mockChatbot.clearSession).toHaveBeenCalled();
      expect(component.exitConfirmStep).toBe('none');
    });

    it('durante una chat live NON cancella subito: apre il dialog di conferma', () => {
      setLiveState('live');

      component.requestClear();

      expect(mockChatbot.clearSession).not.toHaveBeenCalled();
      expect(component.exitConfirmStep).toBe('ask_resolved');
    });
  });

  describe('flusso completo del dialog', () => {
    it('annullare al primo passaggio non chiude né avanza', () => {
      setLiveState('live');
      component.requestClose();

      component.onExitCancel();

      expect(component.exitConfirmStep).toBe('none');
      expect(mockChatbot.close).not.toHaveBeenCalled();
      expect(mockLiveHandoff.closeByVisitor).not.toHaveBeenCalled();
    });

    it('avanzare al secondo passaggio ancora non chiude nulla', () => {
      setLiveState('live');
      component.requestClose();

      component.onExitAdvance();

      expect(component.exitConfirmStep).toBe('ask_close');
      expect(mockChatbot.close).not.toHaveBeenCalled();
    });

    it('confermare dopo aver avanzato chiude davvero — notifica il backend PRIMA di chatbot.close()', () => {
      setLiveState('live');
      component.requestClose();
      component.onExitAdvance();

      component.onExitConfirm();

      expect(mockLiveHandoff.closeByVisitor).toHaveBeenCalled();
      expect(mockChatbot.close).toHaveBeenCalled();
      expect(component.exitConfirmStep).toBe('none');
    });

    it('se l’azione in sospeso era "cancella", confermare cancella la conversazione, non chiude il pannello', () => {
      setLiveState('live');
      component.requestClear();
      component.onExitAdvance();

      component.onExitConfirm();

      expect(mockChatbot.clearSession).toHaveBeenCalled();
      expect(mockLiveHandoff.reset).toHaveBeenCalled();
      expect(mockChatbot.close).not.toHaveBeenCalled();
    });

    it('annullare al secondo passaggio non chiude comunque nulla', () => {
      setLiveState('live');
      component.requestClose();
      component.onExitAdvance();

      component.onExitCancel();

      expect(component.exitConfirmStep).toBe('none');
      expect(mockLiveHandoff.closeByVisitor).not.toHaveBeenCalled();
      expect(mockChatbot.close).not.toHaveBeenCalled();
    });
  });
});
