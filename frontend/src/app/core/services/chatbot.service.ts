import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { loadChatMessages, saveChatMessages } from '../utils/chat-history-storage';

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
const MESSAGES_STORAGE_KEY = 'chatbot_messages';

/**
 * Cronologia ripresa dopo un ricaricamento. Solo se c'è ancora l'identificativo di sessione: senza,
 * i messaggi salvati appartengono a una conversazione già cancellata e non vanno mostrati.
 */
function restoredMessages(): ChatMessage[] {
  try {
    if (typeof sessionStorage === 'undefined' || !sessionStorage.getItem(SESSION_STORAGE_KEY)) return [];
  } catch {
    return [];
  }
  return loadChatMessages(MESSAGES_STORAGE_KEY);
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private readonly apiUrl = `${environment.apiUrl}/chatbot`;

  private readonly _messages = new BehaviorSubject<ChatMessage[]>(restoredMessages());
  private readonly _isLoading = new BehaviorSubject<boolean>(false);
  private readonly _isOpen = new BehaviorSubject<boolean>(false);
  private readonly _suggestions = new BehaviorSubject<string[]>([]);

  readonly messages$: Observable<ChatMessage[]> = this._messages.asObservable();
  readonly isLoading$: Observable<boolean> = this._isLoading.asObservable();
  readonly isOpen$: Observable<boolean> = this._isOpen.asObservable();
  readonly suggestions$: Observable<string[]> = this._suggestions.asObservable();

  private sessionId: string | null = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_STORAGE_KEY) : null;

  /**
   * Risposta a pezzi (Server-Sent Events) se il browser lo permette: il testo compare mentre il modello lo
   * scrive, invece di dopo diversi secondi di puntini. Se lo stream non parte si ripiega sulla richiesta normale.
   */
  /** Cambia a ogni cancellazione della chat: uno stream ancora in corso non deve scrivere nella nuova conversazione. */
  private generation = 0;

  streaming =
    typeof fetch === 'function' && typeof ReadableStream === 'function' && typeof TextDecoder === 'function';

  /** Facoltativo: senza (nei test che costruiscono il servizio a mano) il messaggio d'errore resta in inglese. */
  private readonly translate = inject(TranslateService, { optional: true });

  constructor(private readonly http: HttpClient) {
    // Ogni cambiamento della conversazione si salva (e una conversazione vuota cancella la chiave):
    // dopo un ricaricamento della pagina la chat riparte da dove era.
    this._messages.subscribe((messages) => saveChatMessages(MESSAGES_STORAGE_KEY, messages));
  }

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

    if (this.streaming) {
      void this.streamMessage(trimmed, lang);
      return;
    }
    this.sendViaHttp(trimmed, lang);
  }

  /** Risposta intera in una sola richiesta: usata se lo stream non è disponibile o non parte. */
  private sendViaHttp(trimmed: string, lang?: string): void {
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
            content: this.serverErrorText(),
            timestamp: new Date(),
          };
          this._messages.next([...this._messages.getValue(), errMsg]);
        },
      });
  }

  /**
   * Invia il messaggio a /message/stream e mostra il testo man mano. Eventi: `delta` (testo), `done` (risultato
   * finale, che sostituisce il testo mostrato: toglie le righe di servizio e porta suggerimenti e offerta live),
   * `error`. Ripiega su sendViaHttp se non è comparso ancora nulla; se il testo era già in parte visibile lo tiene.
   */
  private async streamMessage(trimmed: string, lang?: string): Promise<void> {
    const gen = this.generation;
    let shown = '';
    let started = false;
    let finished = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const timestamp = new Date();

    const render = (content: string, extra: Partial<ChatMessage> = {}): void => {
      if (gen !== this.generation) return;
      const msgs = this._messages.getValue();
      const msg: ChatMessage = { role: 'assistant', content, timestamp, ...extra };
      this._messages.next(started ? [...msgs.slice(0, -1), msg] : [...msgs, msg]);
      started = true;
    };
    // Gli aggiornamenti si raggruppano (~12 al secondo): ogni modifica salva la chat e riscrive la bolla.
    const scheduleRender = (): void => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!finished) render(shown);
      }, 80);
    };
    const stopTimer = (): void => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
    };

    try {
      const res = await fetch(`${this.apiUrl}/message/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: trimmed, sessionId: this.sessionId ?? undefined, lang }),
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawEvent = false;

      const handle = (event: string, data: string): void => {
        if (gen !== this.generation) return;
        sawEvent = true;
        let payload: any = null;
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }
        if (event === 'delta' && typeof payload?.t === 'string') {
          shown += payload.t;
          if (!started) {
            // Primo testo: i puntini di attesa lasciano il posto alla risposta.
            render(shown);
            this._isLoading.next(false);
          } else {
            scheduleRender();
          }
        } else if (event === 'done') {
          finished = true;
          stopTimer();
          const result = payload as SendMessageResponse;
          this.sessionId = result.sessionId;
          sessionStorage.setItem(SESSION_STORAGE_KEY, result.sessionId);
          render(result.reply, { timestamp: new Date(result.timestamp), liveOffer: result.liveOffer });
          this._suggestions.next(result.suggestions ?? []);
        } else if (event === 'error') {
          throw new Error(payload?.message ?? 'stream error');
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
          }
          if (data.length) handle(event, data.join('\n'));
        }
      }
      if (!finished) {
        // Stream chiuso senza "done": col testo già visibile lo si tiene, altrimenti si riprova senza stream.
        if (!sawEvent || !started) throw new Error('stream closed');
        finished = true;
      }
    } catch {
      stopTimer();
      // La chat è stata cancellata mentre arrivava la risposta: non c'è più niente da mostrare né da ritentare.
      if (gen !== this.generation) return;
      if (!started) {
        // Nulla da mostrare ancora: richiesta normale (server senza streaming, proxy che lo blocca, rete…).
        this.sendViaHttp(trimmed, lang);
        return;
      }
      // Testo già visibile ma lo stream si è interrotto: resta quello che c'è.
      finished = true;
      render(shown);
    } finally {
      stopTimer();
      if (this._isLoading.getValue() && (started || finished)) this._isLoading.next(false);
    }
  }

  sendTranscript(email: string): Observable<TranscriptResponse> {
    return this.http.post<TranscriptResponse>(`${this.apiUrl}/send-transcript`, {
      sessionId: this.sessionId,
      email,
    });
  }

  clearSession(): void {
    this.generation++;
    this._isLoading.next(false);
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

  /** Messaggio d'errore nella lingua dell'interfaccia (prima era sempre inglese, anche con il sito in italiano). */
  private serverErrorText(): string {
    const fallback = "I'm sorry, I couldn't reach the server right now. Please try again in a moment.";
    const text = this.translate?.instant('chatbot_ui.server_error');
    return typeof text === 'string' && text && text !== 'chatbot_ui.server_error' ? text : fallback;
  }
}
