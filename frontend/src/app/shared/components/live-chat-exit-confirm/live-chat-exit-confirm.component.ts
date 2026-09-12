import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export type ExitConfirmStep = 'none' | 'ask_resolved' | 'ask_close';

/**
 * Conferma a due passaggi prima di chiudere/cancellare una chat live con Gent: prima
 * chiede se il problema è stato risolto (più umano di un "sei sicuro?" secco), poi
 * conferma esplicitamente la chiusura della sessione. Un "No" in qualunque passaggio
 * annulla tutto — chi non ha ancora risolto probabilmente non vuole uscire.
 */
@Component({
  selector: 'app-live-chat-exit-confirm',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './live-chat-exit-confirm.component.html',
  styleUrl: './live-chat-exit-confirm.component.scss',
})
export class LiveChatExitConfirmComponent implements OnChanges {
  @Input({ required: true }) step: ExitConfirmStep = 'none';

  /** "Sì" al primo passaggio: problema risolto, si passa alla conferma di chiusura. */
  @Output() advance = new EventEmitter<void>();
  /** "Sì, chiudi" al secondo passaggio: chiude davvero la sessione. */
  @Output() confirm = new EventEmitter<void>();
  /** "No" in qualunque passaggio, o click sullo sfondo: annulla, resta in chat. */
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('secondaryBtn') private secondaryBtnRef?: ElementRef<HTMLButtonElement>;

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes['step']?.previousValue;
    if (this.step !== 'none' && prev === 'none') {
      // Il pulsante esiste solo dopo che l'@if lo renderizza; "No" resta l'opzione
      // sicura di default (non far uscire dalla chat per un Invio distratto).
      setTimeout(() => this.secondaryBtnRef?.nativeElement.focus(), 0);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.step !== 'none') this.cancel.emit();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro finché il dialog è visibile. */
  onDialogTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const dialog = ke.currentTarget as HTMLElement;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
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
}
