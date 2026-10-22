import { importProvidersFrom } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatbotComponent,
  NOTICE_DISMISSED_KEY,
  TEASER_DELAY_MS,
  TEASER_VISIBLE_MS,
  TEASER_DISMISSED_KEY,
} from './chatbot.component';
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
            restore: vi.fn(),
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

  const el = (f: ComponentFixture<ChatbotComponent>) => f.nativeElement as HTMLElement;

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

    describe('scadenza automatica', () => {
      const shown = (f: ComponentFixture<ChatbotComponent>) => {
        vi.advanceTimersByTime(TEASER_DELAY_MS);
        f.detectChanges();
      };
      const badge = (f: ComponentFixture<ChatbotComponent>) => el(f).querySelector('.cb-fab__badge');
      const teaser = (f: ComponentFixture<ChatbotComponent>) => el(f).querySelector('.cb-teaser');

      afterEach(() => document.documentElement.removeAttribute('data-cookie-banner-open'));

      it('dura solo alcuni secondi, non resta fisso sopra i contenuti', () => {
        expect(TEASER_VISIBLE_MS).toBeGreaterThanOrEqual(3000);
        expect(TEASER_VISIBLE_MS).toBeLessThanOrEqual(15000);
      });

      it('compare subito e dopo TEASER_VISIBLE_MS sparisce insieme al numero sul pulsante', () => {
        const f = create(false);
        shown(f);
        expect(teaser(f)).not.toBeNull();
        expect(badge(f)?.textContent?.trim()).toBe('1');

        vi.advanceTimersByTime(TEASER_VISIBLE_MS - 1);
        f.detectChanges();
        expect(teaser(f)).not.toBeNull();

        vi.advanceTimersByTime(1);
        f.detectChanges();
        expect(teaser(f)).toBeNull();
        expect(badge(f)).toBeNull();
      });

      it('scaduto, non ricompare per il resto della visita', () => {
        const f = create(false);
        shown(f);
        vi.advanceTimersByTime(TEASER_VISIBLE_MS);

        expect(sessionStorage.getItem(TEASER_DISMISSED_KEY)).toBe('1');
      });

      it('con il puntatore sul fumetto non scade; uscito, riparte il conto', () => {
        const f = create(false);
        shown(f);
        const box = teaser(f) as HTMLElement;

        box.dispatchEvent(new Event('mouseenter'));
        vi.advanceTimersByTime(TEASER_VISIBLE_MS * 3);
        f.detectChanges();
        expect(teaser(f)).not.toBeNull();

        box.dispatchEvent(new Event('mouseleave'));
        vi.advanceTimersByTime(TEASER_VISIBLE_MS);
        f.detectChanges();
        expect(teaser(f)).toBeNull();
        expect(badge(f)).toBeNull();
      });

      it('non scade finché il banner cookie lo nasconde', () => {
        const f = create(false);
        document.documentElement.setAttribute('data-cookie-banner-open', '');
        shown(f);

        vi.advanceTimersByTime(TEASER_VISIBLE_MS * 2);
        f.detectChanges();
        expect(teaser(f)).not.toBeNull();

        document.documentElement.removeAttribute('data-cookie-banner-open');
        vi.advanceTimersByTime(TEASER_VISIBLE_MS);
        f.detectChanges();
        expect(teaser(f)).toBeNull();
      });

      it('aprendo la chat prima della scadenza non resta nessun timer che la disturbi', () => {
        const f = create(false);
        shown(f);
        el(f).querySelector<HTMLButtonElement>('.cb-teaser__body')!.click();
        f.detectChanges();

        vi.advanceTimersByTime(TEASER_VISIBLE_MS * 2);
        f.detectChanges();
        expect(teaser(f)).toBeNull();
      });
    });

    it('compare subito dopo il caricamento, senza far aspettare il visitatore', () => {
      expect(TEASER_DELAY_MS).toBeLessThanOrEqual(1000);
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
