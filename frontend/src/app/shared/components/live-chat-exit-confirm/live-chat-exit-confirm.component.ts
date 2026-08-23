import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
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
export class LiveChatExitConfirmComponent {
  @Input({ required: true }) step: ExitConfirmStep = 'none';

  /** "Sì" al primo passaggio: problema risolto, si passa alla conferma di chiusura. */
  @Output() advance = new EventEmitter<void>();
  /** "Sì, chiudi" al secondo passaggio: chiude davvero la sessione. */
  @Output() confirm = new EventEmitter<void>();
  /** "No" in qualunque passaggio, o click sullo sfondo: annulla, resta in chat. */
  @Output() cancel = new EventEmitter<void>();
}
