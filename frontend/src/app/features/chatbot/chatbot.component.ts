import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatbotService, ChatMessage } from '../../core/services/chatbot.service';
import { LanguageService } from '../../core/services/language.service';
import { LiveHandoffService, LiveHandoffState } from '../../core/services/live-handoff.service';
import { LiveHandoffPromptComponent } from '../../shared/components/live-handoff-prompt/live-handoff-prompt.component';

type PanelView = 'chat' | 'transcript';

const TYPING_DEBOUNCE_MS = 1200;

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule, LiveHandoffPromptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.scss'],
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLElement>;

  readonly chatbot: ChatbotService = inject(ChatbotService);
  readonly liveHandoff: LiveHandoffService = inject(LiveHandoffService);
  private readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private readonly langService: LanguageService = inject(LanguageService);
  private readonly translate: TranslateService = inject(TranslateService);

  messages: ChatMessage[] = [];
  liveMessages: ChatMessage[] = [];
  isLoading = false;
  isOpen = false;
  inputText = '';
  panelView: PanelView = 'chat';

  liveState: LiveHandoffState = 'idle';
  liveMinimized = false;

  private readonly typing$ = new Subject<void>();

  transcriptEmail = '';
  transcriptSending = false;
  transcriptSuccess = false;
  transcriptError = '';

  readonly suggestedQuestions = computed(() => {
    switch (this.langService.current()) {
      case 'en':
        return [
          '👋 Who is Gent?',
          '🛠 What are his skills?',
          '📁 Show me his projects',
          '📬 How can I contact him?',
        ];
      case 'sq':
        return [
          '👋 Kush është Gent?',
          '🛠 Cilat janë aftësitë e tij?',
          '📁 Trego projektet e tij',
          '📬 Si mund ta kontaktoj?',
        ];
      default:
        return [
          '👋 Chi è Gent?',
          '🛠 Quali sono le sue competenze?',
          '📁 Mostrami i suoi progetti',
          '📬 Come posso contattarlo?',
        ];
    }
  });

  private readonly subs = new Subscription();
  private shouldScroll = false;

  ngOnInit(): void {
    this.subs.add(
      this.chatbot.messages$.subscribe((msgs: ChatMessage[]) => {
        this.messages = msgs;
        this.shouldScroll = true;
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
        if (open) this.shouldScroll = true;
        this.cdr.markForCheck();
      }),
    );
    this.subs.add(
      this.liveHandoff.state$.subscribe((state: LiveHandoffState) => {
        this.liveState = state;
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
        if (sessionId) {
          this.liveHandoff.notifyTyping(sessionId, this.chatbot.hasMessages);
        }
      }),
    );
  }

  get displayMessages(): ChatMessage[] {
    return this.liveMessages.length > 0 ? [...this.messages, ...this.liveMessages] : this.messages;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
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
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
