import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: Date;
  liveOffer?: boolean;
}

interface SendMessageResponse {
  sessionId: string;
  reply: string;
  timestamp: string;
  suggestions?: string[];
  liveOffer?: boolean;
}

interface TranscriptResponse {
  success: boolean;
}

const SESSION_STORAGE_KEY = 'chatbot_session_id';

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly apiUrl = `${environment.apiUrl}/chatbot`;

  private readonly _messages = new BehaviorSubject<ChatMessage[]>([]);
  private readonly _isLoading = new BehaviorSubject<boolean>(false);
  private readonly _isOpen = new BehaviorSubject<boolean>(false);
  private readonly _suggestions = new BehaviorSubject<string[]>([]);

  readonly messages$: Observable<ChatMessage[]> = this._messages.asObservable();
  readonly isLoading$: Observable<boolean> = this._isLoading.asObservable();
  readonly isOpen$: Observable<boolean> = this._isOpen.asObservable();
  readonly suggestions$: Observable<string[]> = this._suggestions.asObservable();

  private sessionId: string | null = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;

  constructor(private readonly http: HttpClient) {}

  get isOpen(): boolean {
    return this._isOpen.getValue();
  }

  toggleOpen(): void {
    this._isOpen.next(!this._isOpen.getValue());
  }

  open(): void {
    this._isOpen.next(true);
  }

  close(): void {
    this._isOpen.next(false);
  }

  sendMessage(text: string, lang?: string): void {
    const trimmed = text.trim();
    if (!trimmed || this._isLoading.getValue()) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    this._messages.next([...this._messages.getValue(), userMsg]);
    this._suggestions.next([]);
    this._isLoading.next(true);

    this.http
      .post<SendMessageResponse>(`${this.apiUrl}/message`, {
        message: trimmed,
        sessionId: this.sessionId ?? undefined,
        lang,
      })
      .pipe(
        tap((res) => {
          this.sessionId = res.sessionId;
          sessionStorage.setItem(SESSION_STORAGE_KEY, res.sessionId);

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: res.reply,
            timestamp: new Date(res.timestamp),
            liveOffer: res.liveOffer,
          };
          this._messages.next([...this._messages.getValue(), assistantMsg]);
          this._suggestions.next(res.suggestions ?? []);
        }),
        finalize(() => this._isLoading.next(false)),
      )
      .subscribe({
        error: () => {
          const errMsg: ChatMessage = {
            role: 'assistant',
            content: "I'm sorry, I couldn't reach the server right now. Please try again in a moment.",
            timestamp: new Date(),
          };
          this._messages.next([...this._messages.getValue(), errMsg]);
        },
      });
  }

  sendTranscript(email: string): Observable<TranscriptResponse> {
    return this.http.post<TranscriptResponse>(`${this.apiUrl}/send-transcript`, {
      sessionId: this.sessionId,
      email,
    });
  }

  clearSession(): void {
    this._messages.next([]);
    this._suggestions.next([]);
    this.sessionId = null;
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }

  get hasMessages(): boolean {
    return this._messages.getValue().length > 0;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }
}
