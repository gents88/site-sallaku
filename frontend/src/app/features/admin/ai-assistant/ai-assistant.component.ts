import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { ChatbotService, ChatMessage } from '../../../core/services/chatbot.service';

/** Minimal inline Markdown → safe HTML renderer (no external dependency). */
function renderMarkdown(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="code-block"><code class="lang-${lang || 'text'}">${code.trimEnd()}</code></pre>`,
    )
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>[\s\S]*?<\/li>\s*)+/g, m => `<ul>${m}</ul>`);
  if (!html.startsWith('<')) html = `<p>${html}</p>`;
  return html;
}

const SUGGESTED_PROMPTS: ReadonlyArray<string> = [
  'Chi è Gent Sallaku?',
  'Quali sono le sue competenze tecniche?',
  'Come posso contattarlo?',
  'Mostrami i suoi progetti',
];

/**
 * Full-page AI Assistant component.
 * Adapted from gestionale-pdf/frontend AiAssistantComponent.
 * Uses the current project's ChatbotService (backend-proxied AI) instead of
 * the source's ChatService (direct GROQ calls), preserving the same visual layout.
 */
@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="chat-shell">

      <!-- ── Main chat area ──────────────────────────────── -->
      <main class="chat-main">
        <header class="chat-header">
          <div class="header-title">
            <span class="header-brand" aria-hidden="true">✦</span>
            <span>AI Assistant</span>
          </div>
          <div class="header-actions">
            @if (hasMessages) {
              <button
                class="icon-btn"
                type="button"
                (click)="clearChat()"
                title="Cancella conversazione"
                aria-label="Cancella conversazione"
              >🗑</button>
            }
          </div>
        </header>

        <!-- Messages -->
        <div class="messages-wrap" #msgContainer role="log" aria-live="polite" aria-label="Messaggi">
          @if (!hasMessages && !isLoading) {
            <div class="welcome">
              <div class="welcome-icon" aria-hidden="true">✦</div>
              <h2>Ciao! Sono il tuo AI Assistant</h2>
              <p>Chiedimi qualsiasi cosa su Gent Sallaku, i suoi progetti e le sue competenze.</p>
              <div class="prompt-chips" role="list" aria-label="Domande suggerite">
                @for (prompt of suggestedPrompts; track prompt) {
                  <button class="chip" type="button" role="listitem" (click)="usePrompt(prompt)">
                    {{ prompt }}
                  </button>
                }
              </div>
            </div>
          }

          @for (msg of messages; track msg.timestamp) {
            <div
              class="msg-row"
              [class.user-row]="msg.role === 'user'"
              [class.ai-row]="msg.role === 'assistant'"
            >
              @if (msg.role === 'assistant') {
                <div class="avatar ai-avatar" aria-label="AI">✦</div>
              }
              <div
                class="bubble"
                [class.user-bubble]="msg.role === 'user'"
                [class.ai-bubble]="msg.role === 'assistant'"
              >
                @if (msg.role === 'assistant') {
                  <div class="md-content" [innerHTML]="renderMd(msg.content)"></div>
                } @else {
                  <span class="plain-text">{{ msg.content }}</span>
                }
                <div class="bubble-actions">
                  <button
                    class="bubble-btn"
                    type="button"
                    (click)="copyMessage(msg)"
                    [title]="copiedTimestamp === msg.timestamp ? 'Copiato!' : 'Copia'"
                    [attr.aria-label]="copiedTimestamp === msg.timestamp ? 'Copiato!' : 'Copia messaggio'"
                  >
                    {{ copiedTimestamp === msg.timestamp ? '✓' : '⎘' }}
                  </button>
                </div>
              </div>
              @if (msg.role === 'user') {
                <div class="avatar user-avatar" aria-hidden="true">U</div>
              }
            </div>
          }

          @if (isLoading) {
            <div class="msg-row ai-row" aria-label="L'AI sta scrivendo">
              <div class="avatar ai-avatar" aria-hidden="true">✦</div>
              <div class="bubble ai-bubble">
                <div class="typing-dots" aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Input area -->
        <div class="input-area">
          <div class="input-row">
            <textarea
              class="chat-input"
              #inputEl
              [(ngModel)]="inputText"
              placeholder="Scrivi un messaggio…"
              [disabled]="isLoading"
              rows="1"
              aria-label="Campo messaggio"
              (keydown)="onKeydown($event)"
              (input)="autoResize($event)"
            ></textarea>
            <button
              class="send-btn"
              type="button"
              (click)="send()"
              [disabled]="!inputText.trim() || isLoading"
              aria-label="Invia messaggio"
            >↑</button>
          </div>
          <p class="input-hint">Premi Invio per inviare, Shift+Invio per andare a capo</p>
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host { display: flex; height: calc(100vh - 64px); }

    /* ── Shell ──────────────────────────────────────────── */
    .chat-shell {
      display: flex;
      width: 100%;
      background: var(--bg-primary, #0d1117);
      color: var(--text-primary, #e6edf3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
    }

    /* ── Main ───────────────────────────────────────────── */
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    /* ── Header ─────────────────────────────────────────── */
    .chat-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.85rem 1.25rem;
      border-bottom: 1px solid var(--border, #30363d);
      background: var(--bg-primary, #0d1117);
      flex-shrink: 0;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      font-size: 1rem;
    }

    .header-brand { color: var(--accent, #7c6cfc); font-size: 1.1rem; }

    .header-actions { display: flex; gap: 0.25rem; }

    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-secondary, #8b949e);
      padding: 0.4rem;
      border-radius: 6px;
      font-size: 1rem;
      line-height: 1;
      transition: color 0.15s, background 0.15s;
    }

    .icon-btn:hover {
      color: var(--text-primary, #e6edf3);
      background: var(--bg-hover, #1f2937);
    }

    /* ── Messages ───────────────────────────────────────── */
    .messages-wrap {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem 1rem;
      scroll-behavior: smooth;
    }

    .messages-wrap::-webkit-scrollbar { width: 4px; }
    .messages-wrap::-webkit-scrollbar-thumb {
      background: var(--border, #30363d);
      border-radius: 2px;
    }

    /* ── Welcome ────────────────────────────────────────── */
    .welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      min-height: 60%;
      text-align: center;
      padding: 2rem;
    }

    .welcome-icon { font-size: 2.5rem; color: var(--accent, #7c6cfc); margin-bottom: 0.5rem; }
    .welcome h2 { font-size: 1.35rem; font-weight: 700; margin: 0; }
    .welcome p { color: var(--text-secondary, #8b949e); margin: 0; font-size: 0.95rem; }

    .prompt-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: center;
      margin-top: 0.5rem;
      max-width: 540px;
    }

    .chip {
      padding: 0.45rem 0.85rem;
      border: 1px solid var(--border, #30363d);
      border-radius: 20px;
      background: var(--bg-secondary, #161b22);
      color: var(--text-primary, #e6edf3);
      font-size: 0.82rem;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }

    .chip:hover {
      border-color: var(--accent, #7c6cfc);
      background: rgba(124, 108, 252, 0.1);
    }

    /* ── Message rows ───────────────────────────────────── */
    .msg-row {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      align-items: flex-start;
      max-width: 820px;
      margin-left: auto;
      margin-right: auto;
      width: 100%;
    }

    .user-row { flex-direction: row-reverse; }
    .ai-row   { flex-direction: row; }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      font-weight: 700;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .ai-avatar   { background: linear-gradient(135deg, #7c6cfc, #a78bfa); color: white; }
    .user-avatar { background: var(--accent-user, #3b82f6); color: white; }

    .bubble {
      position: relative;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.6;
      max-width: calc(100% - 50px);
    }

    .ai-bubble {
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border, #30363d);
      border-top-left-radius: 3px;
    }

    .user-bubble {
      background: var(--accent, #7c6cfc);
      color: white;
      border-top-right-radius: 3px;
    }

    .plain-text { white-space: pre-wrap; word-break: break-word; }

    /* ── Copy button ────────────────────────────────────── */
    .bubble-actions {
      display: flex;
      gap: 0.2rem;
      position: absolute;
      bottom: -1.4rem;
      right: 0.25rem;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 1;
    }

    .bubble:hover .bubble-actions { opacity: 1; }

    .bubble-btn {
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border, #30363d);
      border-radius: 4px;
      cursor: pointer;
      color: var(--text-secondary, #8b949e);
      font-size: 0.75rem;
      padding: 0.15rem 0.4rem;
      transition: color 0.15s;
    }

    .bubble-btn:hover { color: var(--text-primary, #e6edf3); }

    /* ── Markdown content ───────────────────────────────── */
    .md-content { word-break: break-word; }

    .md-content :deep(h1) { font-size: 1.2rem; font-weight: 600; margin: 0.75rem 0 0.35rem; }
    .md-content :deep(h2) { font-size: 1.05rem; font-weight: 600; margin: 0.75rem 0 0.35rem; }
    .md-content :deep(h3) { font-size: 0.95rem; font-weight: 600; margin: 0.75rem 0 0.35rem; }
    .md-content :deep(p)  { margin: 0 0 0.6rem; }
    .md-content :deep(ul) { margin: 0.4rem 0; padding-left: 1.4rem; }
    .md-content :deep(li) { margin-bottom: 0.2rem; }

    .md-content :deep(pre.code-block) {
      background: #1a1f2e;
      border: 1px solid var(--border, #30363d);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      overflow-x: auto;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.82rem;
      margin: 0.6rem 0;
    }

    .md-content :deep(code.inline-code) {
      background: rgba(124, 108, 252, 0.15);
      color: #a78bfa;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.85em;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }

    .md-content :deep(blockquote) {
      border-left: 3px solid var(--accent, #7c6cfc);
      padding-left: 0.75rem;
      color: var(--text-secondary, #8b949e);
      margin: 0.5rem 0;
    }

    .md-content :deep(a) { color: var(--accent, #7c6cfc); text-decoration: underline; }

    /* ── Typing indicator ───────────────────────────────── */
    .typing-dots { display: flex; gap: 4px; padding: 0.25rem 0; }

    .typing-dots span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent, #7c6cfc);
      animation: bounce 1.2s infinite;
    }

    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40%            { transform: translateY(-6px); opacity: 1; }
    }

    /* ── Input area ─────────────────────────────────────── */
    .input-area {
      padding: 0.75rem 1rem 1rem;
      border-top: 1px solid var(--border, #30363d);
      background: var(--bg-primary, #0d1117);
      flex-shrink: 0;
    }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 0.5rem;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border, #30363d);
      border-radius: 12px;
      padding: 0.5rem 0.5rem 0.5rem 1rem;
      transition: border-color 0.2s;
      max-width: 820px;
      margin: 0 auto;
    }

    .input-row:focus-within { border-color: var(--accent, #7c6cfc); }

    .chat-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-primary, #e6edf3);
      font-size: 0.9rem;
      line-height: 1.5;
      resize: none;
      font-family: inherit;
      max-height: 160px;
      overflow-y: auto;
    }

    .chat-input::placeholder { color: var(--text-secondary, #8b949e); }
    .chat-input:disabled     { opacity: 0.5; cursor: not-allowed; }

    .send-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: var(--accent, #7c6cfc);
      color: white;
      transition: background 0.15s, transform 0.1s;
    }

    .send-btn:hover:not(:disabled) { background: #6c5ee0; transform: scale(1.05); }
    .send-btn:disabled { background: var(--bg-hover, #1f2937); color: var(--text-secondary, #8b949e); cursor: not-allowed; }

    .input-hint {
      margin: 0.35rem auto 0;
      max-width: 820px;
      font-size: 0.7rem;
      color: var(--text-secondary, #8b949e);
      text-align: right;
    }

    /* ── Responsive ─────────────────────────────────────── */
    @media (max-width: 640px) {
      .msg-row  { max-width: 100%; }
      .input-hint { text-align: center; }
    }
  `],
})
export class AiAssistantComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('msgContainer') private readonly msgContainer!: ElementRef<HTMLElement>;

  private readonly chatbot = inject(ChatbotService);
  private readonly cdr = inject(ChangeDetectorRef);

  messages: ChatMessage[] = [];
  isLoading = false;
  inputText = '';
  copiedTimestamp: Date | null = null;

  readonly suggestedPrompts = SUGGESTED_PROMPTS;

  get hasMessages(): boolean {
    return this.messages.length > 0;
  }

  private shouldScroll = false;
  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.chatbot.messages$.subscribe(msgs => {
        this.messages = msgs;
        this.shouldScroll = true;
        this.cdr.markForCheck();
      }),
    );

    this.subs.add(
      this.chatbot.isLoading$.subscribe(loading => {
        this.isLoading = loading;
        this.shouldScroll = loading;
        this.cdr.markForCheck();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;
    this.inputText = '';
    this.shouldScroll = true;
    this.chatbot.sendMessage(text);
    const el = document.querySelector('.chat-input') as HTMLTextAreaElement | null;
    if (el) { el.style.height = 'auto'; }
  }

  usePrompt(prompt: string): void {
    this.inputText = prompt;
    this.send();
  }

  clearChat(): void {
    this.chatbot.clearSession();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  autoResize(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  renderMd(content: string): string {
    return renderMarkdown(content);
  }

  copyMessage(msg: ChatMessage): void {
    navigator.clipboard.writeText(msg.content).then(() => {
      this.copiedTimestamp = msg.timestamp;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.copiedTimestamp = null;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  private scrollToBottom(): void {
    const el = this.msgContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
