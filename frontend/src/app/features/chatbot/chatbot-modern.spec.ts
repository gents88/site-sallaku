import { importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatbotComponent,
  NOTICE_DISMISSED_KEY,
  TEASER_AUTO_HIDE_MS,
  TEASER_DELAY_MS,
  TEASER_DISMISSED_KEY,
  TEASER_IS_MOBILE,
  TEASER_RETRY_MS,
} from './chatbot.component';
import { ConsentService } from '../../core/services/consent.service';
import { ChatbotService, ChatMessage } from '../../core/services/chatbot.service';
import { LiveHandoffService } from '../../core/services/live-handoff.service';
import { LanguageService } from '../../core/services/language.service';

/**
 * Pannello rinnovato: card iniziali, avviso richiudibile, fumetto d'invito,
 * link del sito come mini-card e copia dei messaggi. Senza loader di
 * traduzioni TranslateService restituisce le chiavi, quindi i test le usano.
 */
describe('ChatbotComponent — pannello rinnovato', () => {
  let mockChatbot: any;
  /** Scelta sui cookie già fatta (banner chiuso) e layout desktop, salvo diversa indicazione. */
  let consentDecided: ReturnType<typeof signal<boolean>>;
  let mobile = false;

  function create(open: boolean, messages: ChatMessage[] = []): ComponentFixture<ChatbotComponent> {
    mockChatbot = {
      messages$: new BehaviorSubject(messages),
      isLoading$: new BehaviorSubject(false),
      isOpen$: new BehaviorSubject(open),
      suggestions$: new BehaviorSubject([]),
      currentSessionId: 's1',
      hasMessages: messages.length > 0,
      close: vi.fn(),
      toggleOpen: vi.fn(() => mockChatbot.isOpen$.next(!mockChatbot.isOpen$.value)),
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
            state$: new BehaviorSubject('idle'),
            minimized$: new BehaviorSubject(false),
            liveMessages$: new BehaviorSubject([]),
            closeByVisitor: vi.fn(),
            reset: vi.fn(),
            notifyTyping: vi.fn(),
          },
        },
        { provide: LanguageService, useValue: { current: () => 'it' } },
        { provide: ConsentService, useValue: { hasDecided: consentDecided } },
        { provide: TEASER_IS_MOBILE, useValue: () => mobile },
      ],
    });
    const fixture = TestBed.createComponent(ChatbotComponent);
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<ChatbotComponent>) => f.nativeElement as HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    consentDecided = signal(true);
    mobile = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('card iniziali', () => {
    it('mostra le quattro card e, al clic, invia la domanda tradotta della card', () => {
      const f = create(true);
      const cards = el(f).querySelectorAll<HTMLButtonElement>('.cb-card');

      expect(cards).toHaveLength(4);
      cards[2].click();

      expect(mockChatbot.sendMessage).toHaveBeenCalledWith('chatbot_ui.card_projects_ask', 'it');
    });
  });

  describe('avviso "scrivi a Gent"', () => {
    it('è una riga sola con link ai contatti e si può chiudere', () => {
      const f = create(true);
      expect(el(f).querySelector('.cb-notice a')?.getAttribute('href')).toBe('/contact');

      el(f).querySelector<HTMLButtonElement>('.cb-notice__close')!.click();
      f.detectChanges();

      expect(el(f).querySelector('.cb-notice')).toBeNull();
      expect(localStorage.getItem(NOTICE_DISMISSED_KEY)).toBe('1');
    });

    it('chiuso una volta, non ricompare alla visita successiva', () => {
      localStorage.setItem(NOTICE_DISMISSED_KEY, '1');
      const f = create(true);

      expect(el(f).querySelector('.cb-notice')).toBeNull();
    });
  });

  describe('fumetto d\'invito', () => {
    it('compare dopo il ritardo se la chat è chiusa e senza conversazione', () => {
      const f = create(false);
      expect(el(f).querySelector('.cb-teaser')).toBeNull();

      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).not.toBeNull();
    });

    it('chiudendolo non torna per il resto della visita', () => {
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      el(f).querySelector<HTMLButtonElement>('.cb-teaser__close')!.click();
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
      expect(sessionStorage.getItem(TEASER_DISMISSED_KEY)).toBe('1');
    });

    it('cliccandolo apre la chat', () => {
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      el(f).querySelector<HTMLButtonElement>('.cb-teaser__body')!.click();
      f.detectChanges();

      expect(mockChatbot.toggleOpen).toHaveBeenCalled();
      expect(el(f).querySelector('.cb-teaser')).toBeNull();
    });

    it('con il fumetto il pulsante mostra il pallino "1"', () => {
      const f = create(false);
      expect(el(f).querySelector('.cb-fab__badge')).toBeNull();

      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-fab__badge')?.textContent?.trim()).toBe('1');
    });

    it('chiuso il fumetto con la X, il pallino resta finché non si apre la chat', () => {
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      el(f).querySelector<HTMLButtonElement>('.cb-teaser__close')!.click();
      f.detectChanges();
      expect(el(f).querySelector('.cb-fab__badge')?.textContent?.trim()).toBe('1');

      mockChatbot.isOpen$.next(true);
      mockChatbot.isOpen$.next(false);
      f.detectChanges();
      expect(el(f).querySelector('.cb-fab__badge')).toBeNull();
    });

    it('chi apre la chat prima del ritardo non lo vede', () => {
      const f = create(false);
      mockChatbot.isOpen$.next(true);
      vi.advanceTimersByTime(TEASER_DELAY_MS * 2);
      mockChatbot.isOpen$.next(false);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
    });

    it('chi ha già una conversazione non lo vede', () => {
      const f = create(false, [{ role: 'user', content: 'ciao', timestamp: new Date(1) }]);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
    });

    it('chiuso in questa visita: non compare cambiando pagina', () => {
      sessionStorage.setItem(TEASER_DISMISSED_KEY, '1');
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
    });

    it('alla visita successiva ricompare, anche se in passato era stato chiuso', () => {
      // vecchia chiave "visto per sempre" della prima versione: non deve più bloccarlo
      localStorage.setItem('gs-chat-teaser-seen', '1');
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).not.toBeNull();
    });

    it('non compare appena caricata la pagina: lascia guardare il sito', () => {
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS - 1);
      f.detectChanges();
      expect(el(f).querySelector('.cb-teaser')).toBeNull();
      expect(TEASER_DELAY_MS).toBeGreaterThanOrEqual(10_000);
    });

    it('compare prima del ritardo se il visitatore ha letto metà pagina', () => {
      const f = create(false);
      Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 1200 });
      window.dispatchEvent(new Event('scroll'));
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).not.toBeNull();

      delete (document.documentElement as unknown as Record<string, unknown>)['scrollHeight'];
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    it('con il banner dei cookie ancora aperto aspetta la scelta', () => {
      consentDecided.set(false);
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS + TEASER_RETRY_MS * 3);
      f.detectChanges();
      expect(el(f).querySelector('.cb-teaser')).toBeNull();

      consentDecided.set(true);
      vi.advanceTimersByTime(TEASER_RETRY_MS);
      f.detectChanges();
      expect(el(f).querySelector('.cb-teaser')).not.toBeNull();
    });

    it('si richiude da solo, il pallino resta e non torna in questa visita', () => {
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();
      expect(el(f).querySelector('.cb-teaser')).not.toBeNull();

      vi.advanceTimersByTime(TEASER_AUTO_HIDE_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
      expect(el(f).querySelector('.cb-fab__badge')?.textContent?.trim()).toBe('1');
      expect(sessionStorage.getItem(TEASER_DISMISSED_KEY)).toBe('1');
    });

    it('su mobile niente fumetto sopra il contenuto: solo il pallino sul pulsante', () => {
      mobile = true;
      const f = create(false);
      vi.advanceTimersByTime(TEASER_DELAY_MS);
      f.detectChanges();

      expect(el(f).querySelector('.cb-teaser')).toBeNull();
      expect(el(f).querySelector('.cb-fab__badge')?.textContent?.trim()).toBe('1');
    });
  });

  describe('messaggi', () => {
    const reply: ChatMessage = {
      role: 'assistant',
      content: 'Puoi provare l\'OCR: /lab/ocr. Oppure scrivigli da /contact.',
      timestamp: new Date(2),
    };
    const question: ChatMessage = { role: 'user', content: 'Vai su /lab/viewer', timestamp: new Date(1) };

    it('i link del sito nella risposta diventano mini-card con il path giusto', () => {
      const f = create(true, [question, reply]);
      const hrefs = Array.from(el(f).querySelectorAll('.cb-msg--assistant .cb-link')).map((a) => a.getAttribute('href'));

      expect(hrefs).toEqual(['/lab/ocr', '/contact']);
    });

    it('i messaggi del visitatore non hanno né card né pulsante copia', () => {
      const f = create(true, [question, reply]);
      const mine = el(f).querySelector('.cb-msg--user')!;

      expect(mine.querySelector('.cb-link')).toBeNull();
      expect(mine.querySelector('.cb-msg__copy')).toBeNull();
    });

    it('copia il testo della risposta e mostra "Copiato" per un attimo', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const f = create(true, [{ ...reply, content: 'Usa **Angular** da anni' }]);
      const btn = el(f).querySelector<HTMLButtonElement>('.cb-msg__copy')!;

      btn.click();
      await Promise.resolve();
      f.detectChanges();

      expect(writeText).toHaveBeenCalledWith('Usa Angular da anni');
      expect(btn.getAttribute('aria-label')).toBe('chatbot_ui.copied');

      vi.advanceTimersByTime(2000);
      f.detectChanges();
      expect(btn.getAttribute('aria-label')).toBe('chatbot_ui.copy');
    });

    it('se gli appunti rifiutano, non mostra un "Copiato" falso', async () => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
      const f = create(true, [reply]);
      const btn = el(f).querySelector<HTMLButtonElement>('.cb-msg__copy')!;

      btn.click();
      await Promise.resolve();
      await Promise.resolve();
      f.detectChanges();

      expect(btn.getAttribute('aria-label')).toBe('chatbot_ui.copy');
    });
  });
});
