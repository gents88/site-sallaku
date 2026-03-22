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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatbotService, ChatMessage } from '../../core/services/chatbot.service';

type PanelView = 'chat' | 'transcript';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ── Floating toggle button ──────────────────────── -->
    <button
      class="cb-fab"
      (click)="chatbot.toggleOpen()"
      [attr.aria-label]="isOpen ? 'Close chat' : 'Open AI assistant'"
      [attr.aria-expanded]="isOpen"
      aria-haspopup="dialog"
    >
      @if (!isOpen) {
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.115 2 11.188c0 2.756 1.274 5.226 3.294 6.934L4 22l4.832-2.118A11.08 11.08 0 0 0 12 20.375c5.523 0 10-4.115 10-9.187S17.523 2 12 2Z"/>
        </svg>
        @if (messages.length > 0) {
          <span class="cb-fab__badge" aria-label="Unread messages">{{ messages.length }}</span>
        }
      } @else {
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
        </svg>
      }
    </button>

    <!-- ── Chat panel ──────────────────────────────────── -->
    @if (isOpen) {
      <div
        class="cb-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI Assistant"
      >
        <!-- Header -->
        <div class="cb-header">
          <div class="cb-header__left">
            <span class="cb-header__avatar" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 2C6.477 2 2 6.115 2 11.188c0 2.756 1.274 5.226 3.294 6.934L4 22l4.832-2.118A11.08 11.08 0 0 0 12 20.375c5.523 0 10-4.115 10-9.187S17.523 2 12 2Z"/>
              </svg>
            </span>
            <div>
              <span class="cb-header__title">AI Assistant</span>
              <span class="cb-header__subtitle">
                @if (isLoading) { Typing… } @else { Online }
              </span>
            </div>
          </div>
          <div class="cb-header__actions">
            @if (panelView === 'chat' && chatbot.hasMessages) {
              <button class="cb-icon-btn" (click)="showTranscriptPanel()" title="Send transcript via email" aria-label="Send transcript via email">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="17" height="17" aria-hidden="true">
                  <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z"/>
                  <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z"/>
                </svg>
              </button>
            }
            @if (chatbot.hasMessages) {
              <button class="cb-icon-btn" (click)="clearChat()" title="Clear conversation" aria-label="Clear conversation">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="17" height="17" aria-hidden="true">
                  <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd"/>
                </svg>
              </button>
            }
            <button class="cb-icon-btn" (click)="chatbot.close()" aria-label="Close chat">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 0 1 1.414 0L10 8.586l4.293-4.293a1 1 0 1 1 1.414 1.414L11.414 10l4.293 4.293a1 1 0 0 1-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 0 1-1.414-1.414L8.586 10 4.293 5.707a1 1 0 0 1 0-1.414Z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- ── Chat View ───────────────────────────────── -->
        @if (panelView === 'chat') {
          <div class="cb-messages" #messagesContainer role="log" aria-live="polite" aria-label="Chat messages">
            @if (messages.length === 0 && !isLoading) {
              <div class="cb-welcome">
                <div class="cb-welcome__icon" aria-hidden="true">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                    <path d="M12 2C6.477 2 2 6.115 2 11.188c0 2.756 1.274 5.226 3.294 6.934L4 22l4.832-2.118A11.08 11.08 0 0 0 12 20.375c5.523 0 10-4.115 10-9.187S17.523 2 12 2Z"/>
                  </svg>
                </div>
                <h3 class="cb-welcome__title">Hi there! 👋</h3>
                <p class="cb-welcome__text">
                  I'm the AI assistant on <strong>Gent Sallaku's</strong> portfolio. Ask me anything about his projects, skills, or services!
                </p>
                <div class="cb-chips" role="list" aria-label="Suggested questions">
                  @for (chip of suggestedQuestions; track chip) {
                    <button class="cb-chip" role="listitem" (click)="sendChip(chip)">{{ chip }}</button>
                  }
                </div>
              </div>
            }

            @for (msg of messages; track msg.timestamp) {
              <div class="cb-msg" [class.cb-msg--user]="msg.role === 'user'" [class.cb-msg--assistant]="msg.role === 'assistant'">
                @if (msg.role === 'assistant') {
                  <span class="cb-msg__avatar" aria-hidden="true">AI</span>
                }
                <div class="cb-msg__bubble">
                  <p class="cb-msg__content" [innerHTML]="formatMessage(msg.content)"></p>
                  <span class="cb-msg__time">{{ msg.timestamp | date:'HH:mm' }}</span>
                </div>
              </div>
            }

            @if (isLoading) {
              <div class="cb-msg cb-msg--assistant" aria-label="AI is typing">
                <span class="cb-msg__avatar" aria-hidden="true">AI</span>
                <div class="cb-msg__bubble cb-typing-bubble">
                  <span class="cb-dot" aria-hidden="true"></span>
                  <span class="cb-dot" aria-hidden="true"></span>
                  <span class="cb-dot" aria-hidden="true"></span>
                </div>
              </div>
            }
          </div>

          <!-- Input area -->
          <form class="cb-input-area" (ngSubmit)="send()" aria-label="Send a message">
            <textarea
              class="cb-input"
              placeholder="Type a message…"
              [(ngModel)]="inputText"
              name="chatInput"
              rows="1"
              [disabled]="isLoading"
              (keydown.enter)="handleEnter($event)"
              (input)="autoResize($event)"
              aria-label="Message"
              maxlength="1000"
            ></textarea>
            <button
              type="submit"
              class="cb-send-btn"
              [disabled]="!inputText.trim() || isLoading"
              aria-label="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
              </svg>
            </button>
          </form>
        }

        <!-- ── Transcript View ─────────────────────────── -->
        @if (panelView === 'transcript') {
          <div class="cb-transcript-panel">
            <button class="cb-back-btn" (click)="panelView = 'chat'" aria-label="Back to chat">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                <path fill-rule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clip-rule="evenodd"/>
              </svg>
              Back to chat
            </button>
            <h3 class="cb-transcript-panel__title">Receive transcript</h3>
            <p class="cb-transcript-panel__desc">Enter your email and we'll send you the full conversation.</p>

            @if (transcriptSuccess) {
              <div class="cb-alert cb-alert--success" role="status">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd"/>
                </svg>
                Transcript sent successfully!
              </div>
            }

            @if (transcriptError) {
              <div class="cb-alert cb-alert--error" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
                </svg>
                {{ transcriptError }}
              </div>
            }

            <form class="cb-transcript-form" (ngSubmit)="submitTranscript()" #transcriptForm="ngForm" novalidate>
              <label class="cb-label" for="transcriptEmail">Your email address</label>
              <input
                id="transcriptEmail"
                type="email"
                class="cb-email-input"
                placeholder="your@email.com"
                [(ngModel)]="transcriptEmail"
                name="transcriptEmail"
                required
                email
                [disabled]="transcriptSending || transcriptSuccess"
                #emailField="ngModel"
                aria-describedby="emailHint"
              />
              @if (emailField.invalid && emailField.touched) {
                <span class="cb-field-error" id="emailHint" role="alert">Please enter a valid email address.</span>
              }
              <button
                type="submit"
                class="cb-send-transcript-btn"
                [disabled]="transcriptForm.invalid || transcriptSending || transcriptSuccess"
              >
                @if (transcriptSending) { Sending… } @else { Send transcript }
              </button>
            </form>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    /* ── Variables ───────────────────────────────────── */
    :host {
      --cb-accent: #4f6af5;
      --cb-accent-2: #8b5cf6;
      --cb-bg: #0a0e1a;
      --cb-surface: #0f1729;
      --cb-surface-2: #1a2035;
      --cb-border: rgba(148, 163, 184, 0.12);
      --cb-text: #e2e8f0;
      --cb-text-muted: #94a3b8;
      --cb-radius: 20px;
      --cb-shadow: 0 24px 80px rgba(2, 6, 23, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.1);
      --cb-user-bg: linear-gradient(135deg, #4f6af5, #8b5cf6);
      --cb-bot-bg: #1a2035;
    }

    /* ── FAB ─────────────────────────────────────────── */
    .cb-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 1500;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--cb-accent), var(--cb-accent-2));
      color: #fff;
      box-shadow: 0 8px 32px rgba(79, 106, 245, 0.45);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      outline-offset: 3px;
    }

    .cb-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 40px rgba(79, 106, 245, 0.6);
    }

    .cb-fab:active { transform: scale(0.96); }

    .cb-fab__badge {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #ef4444;
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--cb-bg);
    }

    /* ── Panel ───────────────────────────────────────── */
    .cb-panel {
      position: fixed;
      bottom: 100px;
      right: 28px;
      z-index: 1499;
      width: min(400px, calc(100vw - 40px));
      height: min(600px, calc(100vh - 140px));
      background: var(--cb-bg);
      border-radius: var(--cb-radius);
      box-shadow: var(--cb-shadow);
      border: 1px solid var(--cb-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: cbSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes cbSlideIn {
      from { opacity: 0; transform: translateY(24px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* ── Header ──────────────────────────────────────── */
    .cb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: linear-gradient(135deg, rgba(79,106,245,0.18), rgba(139,92,246,0.12));
      border-bottom: 1px solid var(--cb-border);
      flex-shrink: 0;
    }

    .cb-header__left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .cb-header__avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cb-accent), var(--cb-accent-2));
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
    }

    .cb-header__title {
      display: block;
      font-weight: 700;
      font-size: 0.9rem;
      color: var(--cb-text);
      line-height: 1.2;
    }

    .cb-header__subtitle {
      display: block;
      font-size: 0.72rem;
      color: #34d399;
      line-height: 1.2;
    }

    .cb-header__actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .cb-icon-btn {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--cb-text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }

    .cb-icon-btn:hover {
      background: rgba(148, 163, 184, 0.1);
      color: var(--cb-text);
    }

    /* ── Messages ────────────────────────────────────── */
    .cb-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
    }

    .cb-messages::-webkit-scrollbar { width: 4px; }
    .cb-messages::-webkit-scrollbar-track { background: transparent; }
    .cb-messages::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 2px; }

    /* ── Welcome screen ──────────────────────────────── */
    .cb-welcome {
      text-align: center;
      padding: 16px 8px 8px;
      animation: cbFadeIn 0.4s ease;
    }

    @keyframes cbFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .cb-welcome__icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(79,106,245,0.2), rgba(139,92,246,0.2));
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--cb-accent);
    }

    .cb-welcome__title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--cb-text);
      margin: 0 0 8px;
    }

    .cb-welcome__text {
      font-size: 0.85rem;
      color: var(--cb-text-muted);
      line-height: 1.6;
      margin: 0 0 16px;
    }

    .cb-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
    }

    .cb-chip {
      border: 1px solid var(--cb-border);
      background: var(--cb-surface);
      color: var(--cb-text);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .cb-chip:hover {
      background: rgba(79,106,245,0.15);
      border-color: rgba(79,106,245,0.4);
      color: #a5b4fc;
    }

    /* ── Message bubbles ─────────────────────────────── */
    .cb-msg {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      animation: cbMsgIn 0.2s ease-out;
    }

    @keyframes cbMsgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .cb-msg--user {
      flex-direction: row-reverse;
    }

    .cb-msg__avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--cb-accent), var(--cb-accent-2));
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-bottom: 2px;
    }

    .cb-msg__bubble {
      max-width: 78%;
      padding: 10px 14px;
      border-radius: 16px;
      position: relative;
    }

    .cb-msg--user .cb-msg__bubble {
      background: var(--cb-user-bg);
      border-radius: 16px 16px 4px 16px;
    }

    .cb-msg--assistant .cb-msg__bubble {
      background: var(--cb-bot-bg);
      border: 1px solid var(--cb-border);
      border-radius: 16px 16px 16px 4px;
    }

    .cb-msg__content {
      margin: 0 0 4px;
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--cb-text);
      word-break: break-word;
    }

    .cb-msg__content :global(strong) { color: #a5b4fc; }
    .cb-msg__content :global(em) { color: #94a3b8; }

    .cb-msg__time {
      display: block;
      font-size: 0.68rem;
      color: rgba(148,163,184,0.6);
      text-align: right;
    }

    /* ── Typing indicator ────────────────────────────── */
    .cb-typing-bubble {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 12px 16px;
      min-width: 56px;
    }

    .cb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cb-text-muted);
      animation: cbDotPulse 1.4s infinite ease-in-out;
    }

    .cb-dot:nth-child(2) { animation-delay: 0.2s; }
    .cb-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes cbDotPulse {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.9); }
      40%            { opacity: 1;   transform: scale(1.1); }
    }

    /* ── Input area ──────────────────────────────────── */
    .cb-input-area {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px 14px;
      border-top: 1px solid var(--cb-border);
      background: var(--cb-surface);
      flex-shrink: 0;
    }

    .cb-input {
      flex: 1;
      background: var(--cb-surface-2);
      border: 1px solid var(--cb-border);
      border-radius: 12px;
      padding: 10px 14px;
      color: var(--cb-text);
      font-size: 0.875rem;
      line-height: 1.5;
      resize: none;
      outline: none;
      transition: border-color 0.15s;
      min-height: 42px;
      max-height: 120px;
      font-family: inherit;
    }

    .cb-input::placeholder { color: var(--cb-text-muted); }
    .cb-input:focus { border-color: rgba(79,106,245,0.5); }

    .cb-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, var(--cb-accent), var(--cb-accent-2));
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }

    .cb-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .cb-send-btn:not(:disabled):hover { transform: scale(1.05); opacity: 0.9; }

    /* ── Transcript panel ────────────────────────────── */
    .cb-transcript-panel {
      flex: 1;
      padding: 20px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .cb-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: var(--cb-text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      padding: 0;
      transition: color 0.15s;
    }

    .cb-back-btn:hover { color: var(--cb-text); }

    .cb-transcript-panel__title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--cb-text);
      margin: 0;
    }

    .cb-transcript-panel__desc {
      font-size: 0.82rem;
      color: var(--cb-text-muted);
      margin: 0;
      line-height: 1.5;
    }

    .cb-transcript-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cb-label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--cb-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .cb-email-input {
      background: var(--cb-surface-2);
      border: 1px solid var(--cb-border);
      border-radius: 10px;
      padding: 10px 14px;
      color: var(--cb-text);
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
      font-family: inherit;
    }

    .cb-email-input:focus { border-color: rgba(79,106,245,0.5); }

    .cb-field-error {
      font-size: 0.75rem;
      color: #f87171;
    }

    .cb-send-transcript-btn {
      padding: 11px 18px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, var(--cb-accent), var(--cb-accent-2));
      color: #fff;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .cb-send-transcript-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .cb-alert {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 500;
    }

    .cb-alert--success {
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.25);
      color: #34d399;
    }

    .cb-alert--error {
      background: rgba(248, 113, 113, 0.12);
      border: 1px solid rgba(248, 113, 113, 0.25);
      color: #f87171;
    }

    /* ── Responsive ──────────────────────────────────── */
    @media (max-width: 480px) {
      .cb-fab { bottom: 18px; right: 18px; }
      .cb-panel { bottom: 88px; right: 18px; left: 18px; width: auto; }
    }
  `],
})
export class ChatbotComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLElement>;

  readonly chatbot: ChatbotService = inject(ChatbotService);
  private readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  messages: ChatMessage[] = [];
  isLoading = false;
  isOpen = false;
  inputText = '';
  panelView: PanelView = 'chat';

  transcriptEmail = '';
  transcriptSending = false;
  transcriptSuccess = false;
  transcriptError = '';

  readonly suggestedQuestions = [
    '👋 Who is Gent?',
    '🛠 What are his skills?',
    '📁 Show me his projects',
    '📬 How can I contact him?',
  ];

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
    this.chatbot.sendMessage(this.inputText);
    this.inputText = '';
  }

  sendChip(text: string): void {
    this.chatbot.sendMessage(text);
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

  clearChat(): void {
    this.chatbot.clearSession();
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
          this.transcriptError = 'Failed to send the transcript. Please try again.';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.transcriptSending = false;
        this.transcriptError = 'An error occurred. Please try again later.';
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
