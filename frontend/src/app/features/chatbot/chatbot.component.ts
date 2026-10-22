import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatbotService, ChatMessage } from '../../core/services/chatbot.service';
import { LanguageService } from '../../core/services/language.service';
import { LiveHandoffService, LiveHandoffState } from '../../core/services/live-handoff.service';
import { FeatureFlagsService } from '../../core/services/feature-flags.service';
import { LiveHandoffPromptComponent } from '../../shared/components/live-handoff-prompt/live-handoff-prompt.component';
import {
  ExitConfirmStep,
  LiveChatExitConfirmComponent,
} from '../../shared/components/live-chat-exit-confirm/live-chat-exit-confirm.component';
import { LangUrlPipe } from '../../shared/pipes/lang-url.pipe';
import { NavIconComponent, navIconColor } from '../../shared/components/nav-icon/nav-icon.component';
import { ProfilePhotoComponent } from '../../shared/components/profile-photo/profile-photo.component';
import { ChatLink, extractChatLinks } from './chat-links';
import { formatChatMessage } from './format-message';

type PanelView = 'chat' | 'transcript';
type PendingExitAction = 'close' | 'clear' | null;

const TYPING_DEBOUNCE_MS = 1200;

/**
 * Il fumetto "Hai domande su Gent?" accompagna il pulsante a ogni visita: compare
 * subito dopo il caricamento (il breve ritardo serve solo all'animazione d'ingresso)
 * e dopo TEASER_VISIBLE_MS sparisce da solo, insieme al pallino col numero: è un
 * invito, non deve restare sopra i contenuti. Si ferma finché il puntatore o il
 * focus sono sul fumetto, e non scade mentre il banner cookie lo nasconde.
 * Chiuso (a mano o per scadenza) non torna per il resto della visita
 * (sessionStorage); alla visita successiva ricompare.
 */
export const TEASER_DELAY_MS = 800;
/** Quanto resta a schermo il fumetto (e il numero sul pulsante) prima di sparire da solo. */
export const TEASER_VISIBLE_MS = 8000;
export const TEASER_DISMISSED_KEY = 'gs-chat-teaser-dismissed';
export const NOTICE_DISMISSED_KEY = 'gs-chat-notice-dismissed';
const COPIED_FEEDBACK_MS = 1500;

/** Card iniziali: titolo, descrizione e domanda inviata vengono da chatbot_ui.card_<id>_*. */
export interface SuggestionCard {
  id: 'who' | 'skills' | 'projects' | 'contact';
  icon: string;
}

export const SUGGESTION_CARDS: readonly SuggestionCard[] = [
  { id: 'who', icon: 'user' },
  { id: 'skills', icon: 'sparkles' },
  { id: 'projects', icon: 'grid' },
  { id: 'contact', icon: 'mail' },
];

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    LiveHandoffPromptComponent,
    LiveChatExitConfirmComponent,
    LangUrlPipe,
    NavIconComponent,
    ProfilePhotoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss'],
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLElement>;
  @ViewChild('chatInput') private chatInputRef?: ElementRef<HTMLTextAreaElement>;

  readonly chatbot: ChatbotService = inject(ChatbotService);
  readonly liveHandoff: LiveHandoffService = inject(LiveHandoffService);
  readonly flags: FeatureFlagsService = inject(FeatureFlagsService);
  private readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private readonly langService: LanguageService = inject(LanguageService);
  private readonly translate: TranslateService = inject(TranslateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);

  messages: ChatMessage[] = [];
  liveMessages: ChatMessage[] = [];
  followUpSuggestions: string[] = [];
  isLoading = false;
  isOpen = false;
  inputText = '';
  panelView: PanelView = 'chat';

  /** Messaggi (assistente/agente) arrivati mentre il pannello era chiuso — azzerato all'apertura. */
  unreadCount = 0;
  private lastSeenBotLen = 0;
  private lastSeenLiveLen = 0;

  /** Vero quando lo scroll dei messaggi è vicino al fondo — governa l'auto-scroll vs il pulsante "nuovi messaggi". */
  isNearBottom = true;
  showJumpToBottom = false;
  private readonly SCROLL_BOTTOM_THRESHOLD = 80;

  liveState: LiveHandoffState = 'idle';
  liveMinimized = false;
  exitConfirmStep: ExitConfirmStep = 'none';
  private pendingExitAction: PendingExitAction = null;

  private readonly typing$ = new Subject<void>();

  transcriptEmail = '';
  transcriptSending = false;
  transcriptSuccess = false;
  transcriptError = '';

  readonly suggestionCards = SUGGESTION_CARDS;
  readonly iconColor = navIconColor;

  /** Avviso "per una risposta personale scrivi a Gent": una riga, richiudibile (ricordato). */
  noticeDismissed = false;

  /** Fumetto d'invito accanto al pulsante. */
  teaserVisible = false;
  /**
   * L'invito conta come un messaggio non letto: il pallino "1" compare con il
   * fumetto e resta anche se il fumetto viene chiuso, finché la chat non si apre.
   */
  inviteUnread = false;
  private teaserTimer: ReturnType<typeof setTimeout> | null = null;
  private teaserHideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Puntatore o focus sul fumetto: la scadenza aspetta. */
  private teaserHeld = false;

  /** Messaggio appena copiato: il pulsante mostra "Copiato" per un attimo. */
  copiedMessage: ChatMessage | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly linkCache = new Map<string, ChatLink[]>();

  private readonly subs = new Subscription();
  private shouldScroll = false;

  ngOnInit(): void {
    this.noticeDismissed = this.readFlag(NOTICE_DISMISSED_KEY);
    this.scheduleTeaser();

    this.subs.add(
      this.chatbot.messages$.subscribe((msgs: ChatMessage[]) => {
        const newOnes = msgs.slice(this.lastSeenBotLen);
        this.lastSeenBotLen = msgs.length;
        if (!this.isOpen) {
          this.unreadCount += newOnes.filter((m) => m.role !== 'user').length;
        }
        this.messages = msgs;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.chatbot.suggestions$.subscribe((suggestions: string[]) => {
        this.followUpSuggestions = suggestions;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.chatbot.isLoading$.subscribe((loading: boolean) => {
        this.isLoading = loading;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.chatbot.isOpen$.subscribe((open: boolean) => {
        this.isOpen = open;
        if (open) {
          this.hideTeaser();
          this.inviteUnread = false;
          this.shouldScroll = true;
          this.unreadCount = 0;
          this.isNearBottom = true;
          this.showJumpToBottom = false;
          // L'input esiste solo dopo che l'@if del pannello lo renderizza.
          setTimeout(() => this.chatInputRef?.nativeElement.focus(), 0);
        }
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.liveHandoff.state$.subscribe((state: LiveHandoffState) => {
        const previous = this.liveState;
        this.liveState = state;
        // Quando Gent chiude (o non risponde) l'avviso compare in fondo alla conversazione:
        // senza scroll resta sotto il bordo visibile e, a pannello chiuso, non c'è nessun
        // segnale — i messaggi di Gent invece contano come non letti, la chiusura no.
        if ((state === 'closed' || state === 'expired') && previous !== state) {
          this.shouldScroll = true;
          if (!this.isOpen) this.unreadCount += 1;
        }
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.liveHandoff.minimized$.subscribe((minimized: boolean) => {
        this.liveMinimized = minimized;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.liveHandoff.liveMessages$.subscribe((msgs) => {
        const newOnes = msgs.slice(this.lastSeenLiveLen);
        this.lastSeenLiveLen = msgs.length;
        if (!this.isOpen) {
          this.unreadCount += newOnes.filter((m) => m.from === 'agent').length;
        }
        this.liveMessages = msgs.map((m) => ({
          role: m.from === 'visitor' ? 'user' : 'agent',
          content: m.text,
          timestamp: m.sentAt,
        }));
        this.shouldScroll = true;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.typing$.pipe(debounceTime(TYPING_DEBOUNCE_MS)).subscribe(() => {
        const sessionId = this.chatbot.currentSessionId;
        // Chat dal vivo spenta dalla dashboard: niente banner "Vuoi parlare con Gent?".
        if (sessionId && this.flags.liveHandoffEnabled()) {
          this.liveHandoff.notifyTyping(sessionId, this.chatbot.hasMessages);
        }
      }),
    );
  }

  /** Numero sul pallino rosso del pulsante: messaggi non letti più l'invito. */
  get badgeCount(): number {
    return this.unreadCount + (this.inviteUnread ? 1 : 0);
  }

  get displayMessages(): ChatMessage[] {
    return this.liveMessages.length > 0 ? [...this.messages, ...this.liveMessages] : this.messages;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      if (this.isNearBottom) {
        this.scrollToBottom();
      } else {
        this.showJumpToBottom = true;
      }
      this.shouldScroll = false;
    }
  }

  /** Aggiorna isNearBottom mentre l'utente scorre — governa se il prossimo messaggio forza lo scroll o mostra il pulsante "nuovi messaggi". */
  onMessagesScroll(): void {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return;
    this.isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < this.SCROLL_BOTTOM_THRESHOLD;
    if (this.isNearBottom) this.showJumpToBottom = false;
  }

  jumpToBottom(): void {
    this.isNearBottom = true;
    this.showJumpToBottom = false;
    this.scrollToBottom();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.requestClose();
  }

  /** Focus trap manuale sul pannello: Tab/Shift+Tab restano dentro finché è aperto come dialog. */
  onPanelTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const panel = ke.currentTarget as HTMLElement;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.teaserTimer) clearTimeout(this.teaserTimer);
    if (this.teaserHideTimer) clearTimeout(this.teaserHideTimer);
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
  }

  // ── Fumetto d'invito ─────────────────────────────────────────────────────
  private scheduleTeaser(): void {
    if (!this.isBrowser || this.readFlag(TEASER_DISMISSED_KEY, 'session')) return;
    this.teaserTimer = setTimeout(() => {
      this.teaserTimer = null;
      // Chi ha già aperto la chat o ha una conversazione non ha bisogno dell'invito.
      if (this.isOpen || this.chatbot.hasMessages) return;
      this.teaserVisible = true;
      this.inviteUnread = true;
      this.armTeaserExpiry();
      this.cdr.markForCheck();
    }, TEASER_DELAY_MS);
  }

  private armTeaserExpiry(): void {
    if (this.teaserHideTimer) clearTimeout(this.teaserHideTimer);
    this.teaserHideTimer = setTimeout(() => {
      this.teaserHideTimer = null;
      // Non scade se il visitatore ci sta sopra o se il banner cookie lo nasconde
      // (display:none): altrimenti sparirebbe senza che nessuno l'abbia visto.
      if (this.teaserHeld || this.document.documentElement.hasAttribute('data-cookie-banner-open')) {
        this.armTeaserExpiry();
        return;
      }
      this.hideTeaser();
      // Il numero sul pulsante è parte dell'invito: sparisce con il fumetto.
      this.inviteUnread = false;
      this.cdr.markForCheck();
    }, TEASER_VISIBLE_MS);
  }

  /** Puntatore o focus entrano/escono dal fumetto: la scadenza si ferma e riparte. */
  holdTeaser(held: boolean): void {
    this.teaserHeld = held;
    if (!held && this.teaserVisible) this.armTeaserExpiry();
  }

  /** Chiude il fumetto per il resto della visita. */
  hideTeaser(): void {
    if (this.teaserTimer) {
      clearTimeout(this.teaserTimer);
      this.teaserTimer = null;
    }
    if (this.teaserHideTimer) {
      clearTimeout(this.teaserHideTimer);
      this.teaserHideTimer = null;
    }
    this.teaserHeld = false;
    this.writeFlag(TEASER_DISMISSED_KEY, 'session');
    this.teaserVisible = false;
  }

  openFromTeaser(): void {
    this.hideTeaser();
    this.chatbot.toggleOpen();
  }

  dismissNotice(): void {
    this.noticeDismissed = true;
    this.writeFlag(NOTICE_DISMISSED_KEY);
  }

  // ── Card iniziali, link e copia ──────────────────────────────────────────
  sendCard(card: SuggestionCard): void {
    this.sendChip(this.translate.instant(`chatbot_ui.card_${card.id}_ask`));
  }

  /** Link del sito citati nella risposta, come mini-card (calcolati una volta per testo). */
  linksFor(msg: ChatMessage): ChatLink[] {
    if (msg.role === 'user') return [];
    let links = this.linkCache.get(msg.content);
    if (!links) {
      links = extractChatLinks(msg.content);
      this.linkCache.set(msg.content, links);
    }
    return links;
  }

  /** Su telefono il pannello copre la pagina: aprendo un link lo chiudiamo, su desktop resta aperto. */
  onLinkNavigate(): void {
    if (this.isBrowser && window.matchMedia?.('(max-width: 640px)').matches) this.chatbot.close();
  }

  copyMessage(msg: ChatMessage): void {
    const text = msg.content.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
    const done = () => {
      this.copiedMessage = msg;
      this.cdr.markForCheck();
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedMessage = null;
        this.cdr.markForCheck();
      }, COPIED_FEEDBACK_MS);
    };
    // Rifiutata in alcuni contesti (iframe, permessi): nessun "Copiato" falso.
    navigator.clipboard?.writeText(text).then(done, () => undefined);
  }

  // Preferenze di UI (come tema e sidebar): localStorage se valgono per sempre,
  // sessionStorage se valgono per la visita. Wrappato perché in modalità privata
  // o con storage bloccato l'accesso può lanciare.
  private readFlag(key: string, scope: 'local' | 'session' = 'local'): boolean {
    if (!this.isBrowser) return false;
    try {
      return (scope === 'session' ? sessionStorage : localStorage).getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private writeFlag(key: string, scope: 'local' | 'session' = 'local'): void {
    if (!this.isBrowser) return;
    try {
      (scope === 'session' ? sessionStorage : localStorage).setItem(key, '1');
    } catch {
      /* storage non disponibile: vale solo finché la pagina resta aperta */
    }
  }

  send(): void {
    if (!this.inputText.trim() || this.isLoading) return;
    if (this.liveState === 'live') {
      this.liveHandoff.sendLiveMessage(this.inputText);
    } else {
      this.chatbot.sendMessage(this.inputText, this.langService.current());
    }
    this.inputText = '';
  }

  sendChip(text: string): void {
    this.chatbot.sendMessage(text, this.langService.current());
  }

  handleEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.send();
    }
  }

  autoResize(event: Event): void {
    const ta = event.target as HTMLTextAreaElement;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  onInputChange(event: Event): void {
    this.autoResize(event);
    if (this.liveState === 'idle' || this.liveState === 'prompt_shown') {
      this.typing$.next();
    }
  }

  acceptLiveHandoff(): void {
    const sessionId = this.chatbot.currentSessionId;
    if (!sessionId) return;
    const lastUserMessage = [...this.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    this.liveHandoff.requestHandoff(sessionId, lastUserMessage, this.langService.current());
  }

  declineLiveHandoff(): void {
    const sessionId = this.chatbot.currentSessionId;
    if (sessionId) this.liveHandoff.dismissPrompt(sessionId);
  }

  reopenLiveHandoffPrompt(): void {
    this.liveHandoff.reopenPrompt();
  }

  clearChat(): void {
    this.chatbot.clearSession();
    this.liveHandoff.reset();
    this.panelView = 'chat';
    this.lastSeenBotLen = 0;
    this.lastSeenLiveLen = 0;
    this.unreadCount = 0;
  }

  /** A pannello aperto il pulsante tondo chiude: passa dalla stessa conferma della X. */
  onFabClick(): void {
    if (this.isOpen) this.requestClose();
    else this.chatbot.toggleOpen();
  }

  // ── Chiusura/cancellazione durante una chat live con Gent ────────────────
  // Chiudere il pannello o cancellare la conversazione mentre si sta parlando
  // con una persona vera non può essere un gesto a caso: si chiede conferma
  // invece di eseguire subito.
  requestClose(): void {
    if (this.liveState === 'live') {
      this.pendingExitAction = 'close';
      this.exitConfirmStep = 'ask_resolved';
    } else {
      this.chatbot.close();
    }
  }

  requestClear(): void {
    if (this.liveState === 'live') {
      this.pendingExitAction = 'clear';
      this.exitConfirmStep = 'ask_resolved';
    } else {
      this.clearChat();
    }
  }

  onExitAdvance(): void {
    this.exitConfirmStep = 'ask_close';
  }

  onExitCancel(): void {
    this.exitConfirmStep = 'none';
    this.pendingExitAction = null;
  }

  onExitConfirm(): void {
    this.liveHandoff.closeByVisitor();
    this.exitConfirmStep = 'none';
    const action = this.pendingExitAction;
    this.pendingExitAction = null;
    if (action === 'close') this.chatbot.close();
    else if (action === 'clear') this.clearChat();
  }

  showTranscriptPanel(): void {
    this.panelView = 'transcript';
    this.transcriptSuccess = false;
    this.transcriptError = '';
    this.transcriptEmail = '';
    this.transcriptSending = false;
  }

  submitTranscript(): void {
    if (!this.transcriptEmail || this.transcriptSending || this.transcriptSuccess) return;
    this.transcriptSending = true;
    this.transcriptError = '';

    this.chatbot.sendTranscript(this.transcriptEmail).subscribe({
      next: (res: { success: boolean }) => {
        this.transcriptSending = false;
        if (res.success) {
          this.transcriptSuccess = true;
        } else {
          this.transcriptError = this.translate.instant('chatbot_ui.transcript_error');
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.transcriptSending = false;
        this.transcriptError = this.translate.instant('chatbot_ui.transcript_error');
        this.cdr.markForCheck();
      },
    });
  }

  formatMessage(content: string): string {
    return formatChatMessage(content);
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
