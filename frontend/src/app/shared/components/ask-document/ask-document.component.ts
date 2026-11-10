import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { AskCitation, LibraryChatService } from '../../../core/services/library-chat.service';
import {
  DocPage, hasNoText, pagesFromPlainText, rankPages, toPassages,
} from '../../../core/utils/document-retrieval';

export interface AskMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: AskCitation[];
  ungrounded?: boolean;
}

type ReadState = 'idle' | 'reading' | 'ready' | 'no_text' | 'error';

const MIN_QUESTION = 3;
const MAX_QUESTION = 500;

/** Tipi che sappiamo leggere nel browser: PDF e testo semplice. */
export function isAskable(file: File | null): boolean {
  if (!file) return false;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type === 'application/pdf' || ['pdf', 'txt', 'md'].includes(ext);
}

/**
 * "Chiedi a questo documento" per un file appena aperto in un tool, senza
 * doverlo prima salvare nella Libreria. Il file resta nel browser: si legge qui,
 * si scelgono qui i pochi passaggi pertinenti e al server (`/ai/ask-document`)
 * arrivano solo quelli, mai il documento intero.
 */
@Component({
  selector: 'app-ask-document',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (supported()) {
      <section class="ask" [attr.aria-label]="'ask_doc.title' | translate">
        <button type="button" class="ask__toggle" (click)="toggle()" [attr.aria-expanded]="open()">
          <span aria-hidden="true">💬</span> {{ 'ask_doc.title' | translate }}
          <span class="ask__chev" aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
        </button>

        @if (open()) {
          <div class="ask__panel">
            @switch (state()) {
              @case ('reading') { <p class="ask__note" role="status">{{ 'ask_doc.reading' | translate }}</p> }
              @case ('no_text') { <p class="ask__note ask__note--warn" role="status">{{ 'ask_doc.no_text' | translate }}</p> }
              @case ('error') { <p class="ask__note ask__note--warn" role="alert">{{ 'ask_doc.read_error' | translate }}</p> }
              @default {
                @if (messages().length === 0) {
                  <p class="ask__note">{{ 'ask_doc.intro' | translate }}</p>
                }
                <ol class="ask__log" aria-live="polite">
                  @for (m of messages(); track $index) {
                    <li class="ask__msg" [class.ask__msg--user]="m.role === 'user'" [class.ask__msg--ungrounded]="m.ungrounded">
                      {{ m.text }}
                      @if (m.citations?.length) {
                        <span class="ask__src">{{ 'ask_doc.sources' | translate }}
                          @for (c of m.citations; track $index) { <span class="ask__chip">p. {{ c.page }}</span> }
                        </span>
                      }
                    </li>
                  }
                  @if (asking()) { <li class="ask__msg ask__msg--pending" role="status">…</li> }
                </ol>
                <form class="ask__form" (ngSubmit)="ask()">
                  <input type="text" name="q" class="ask__input" autocomplete="off"
                         [maxlength]="maxQuestion" [(ngModel)]="question"
                         [placeholder]="'ask_doc.placeholder' | translate"
                         [attr.aria-label]="'ask_doc.placeholder' | translate"
                         [disabled]="asking()">
                  <button type="submit" class="ask__send" [disabled]="!canAsk()">{{ 'ask_doc.send' | translate }}</button>
                </form>
                <p class="ask__privacy">{{ 'ask_doc.privacy' | translate }}</p>
              }
            }
          </div>
        }
      </section>
    }
  `,
  styles: [`
    :host { display: block; margin: .75rem 0; }
    .ask { border: 1px solid var(--border-color, rgba(255,255,255,.12)); border-radius: 12px; background: var(--bg-card, rgba(255,255,255,.03)); }
    .ask__toggle { width: 100%; display: flex; align-items: center; gap: .5rem; padding: .6rem .9rem; font: inherit; font-weight: 600; font-size: .92rem; color: var(--text-primary, #e6edf3); background: none; border: 0; cursor: pointer; text-align: left; }
    .ask__chev { margin-left: auto; color: var(--text-secondary, #9aa4b2); }
    .ask__panel { padding: 0 .9rem .8rem; display: flex; flex-direction: column; gap: .6rem; }
    .ask__note { margin: 0; font-size: .85rem; color: var(--text-secondary, #9aa4b2); line-height: 1.5; }
    .ask__note--warn { color: var(--text-primary, #e6edf3); }
    .ask__log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; max-height: 22rem; overflow-y: auto; }
    .ask__msg { padding: .5rem .75rem; border-radius: 10px; font-size: .9rem; line-height: 1.5; white-space: pre-wrap; background: rgba(139,92,246,.08); align-self: flex-start; max-width: 92%; }
    .ask__msg--user { align-self: flex-end; background: rgba(139,92,246,.22); }
    .ask__msg--ungrounded { background: rgba(245,158,11,.1); }
    .ask__src { display: block; margin-top: .35rem; font-size: .78rem; color: var(--text-secondary, #9aa4b2); }
    .ask__chip { display: inline-block; margin-left: .25rem; padding: 0 .4rem; border-radius: 999px; border: 1px solid var(--border-color, rgba(255,255,255,.18)); }
    .ask__form { display: flex; gap: .5rem; }
    .ask__input { flex: 1; min-width: 0; font: inherit; font-size: .9rem; padding: .5rem .7rem; border-radius: 8px; color: var(--text-primary, #e6edf3); background: var(--bg-input, rgba(255,255,255,.05)); border: 1px solid var(--border-color, rgba(255,255,255,.15)); box-sizing: border-box; }
    .ask__send { font: inherit; font-size: .88rem; padding: .5rem .9rem; border-radius: 8px; border: 0; cursor: pointer; color: #fff; background: var(--color-primary, #8b5cf6); }
    .ask__send:disabled { opacity: .5; cursor: not-allowed; }
    .ask__privacy { margin: 0; font-size: .75rem; color: var(--text-secondary, #9aa4b2); }
  `],
})
export class AskDocumentComponent {
  private readonly pdfjs = inject(PdfjsService);
  private readonly chat = inject(LibraryChatService);
  private readonly translate = inject(TranslateService);

  readonly file = input<File | null>(null);

  readonly maxQuestion = MAX_QUESTION;
  readonly supported = computed(() => isAskable(this.file()));
  readonly open = signal(false);
  readonly state = signal<ReadState>('idle');
  readonly messages = signal<AskMessage[]>([]);
  readonly asking = signal(false);
  question = '';

  private pages: DocPage[] = [];
  /** Cambia a ogni nuovo file: scarta le letture e le risposte rimaste in volo del file precedente. */
  private generation = 0;

  constructor() {
    effect(() => {
      this.file();
      untracked(() => this.reset());
    });
  }

  canAsk(): boolean {
    return !this.asking() && this.state() === 'ready' && this.question.trim().length >= MIN_QUESTION;
  }

  toggle(): void {
    this.open.update((v) => !v);
    if (this.open() && this.state() === 'idle') void this.read();
  }

  private reset(): void {
    this.generation++;
    this.pages = [];
    this.open.set(false);
    this.state.set('idle');
    this.messages.set([]);
    this.asking.set(false);
    this.question = '';
  }

  /** Lettura pigra: il costo di estrarre il testo si paga solo se l'utente apre il pannello. */
  private async read(): Promise<void> {
    const file = this.file();
    if (!file) return;
    const gen = this.generation;
    this.state.set('reading');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let pages: DocPage[];
      if (isPdf) {
        const doc = await this.pdfjs.openDocument(await file.arrayBuffer());
        try {
          pages = await this.pdfjs.extractPages(doc);
        } finally {
          await doc.loadingTask.destroy();
        }
      } else {
        pages = pagesFromPlainText(await file.text());
      }
      if (gen !== this.generation) return;
      this.pages = pages;
      this.state.set(hasNoText(pages) ? 'no_text' : 'ready');
    } catch {
      if (gen === this.generation) this.state.set('error');
    }
  }

  async ask(): Promise<void> {
    const question = this.question.trim();
    const file = this.file();
    if (!this.canAsk() || !file) return;
    const gen = this.generation;

    this.messages.update((m) => [...m, { role: 'user', text: question }]);
    this.question = '';
    this.asking.set(true);
    try {
      const passages = toPassages(file.name, rankPages(question, this.pages));
      if (passages.length === 0) {
        this.push(gen, { role: 'assistant', text: this.translate.instant('ask_doc.no_context') as string, ungrounded: true });
        return;
      }
      const answer = await firstValueFrom(this.chat.ask(question, passages, this.translate.currentLang || 'it'));
      this.push(gen, { role: 'assistant', text: answer.answer, citations: answer.citations, ungrounded: !answer.grounded });
    } catch {
      this.push(gen, { role: 'assistant', text: this.translate.instant('ask_doc.error') as string, ungrounded: true });
    } finally {
      if (gen === this.generation) this.asking.set(false);
    }
  }

  private push(gen: number, msg: AskMessage): void {
    if (gen === this.generation) this.messages.update((m) => [...m, msg]);
  }
}
