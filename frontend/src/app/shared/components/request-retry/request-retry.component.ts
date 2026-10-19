import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TrackedRequest } from '../../utils/tracked-request';

/**
 * Pulsante "Riprova" da mettere sotto il messaggio d'errore di un tool del Lab.
 * Compare solo se l'ultima richiesta è fallita per un motivo transitorio
 * (rete, timeout, 429, 5xx): su un file non valido riprovare darebbe lo stesso
 * errore. Emette `retry`: il tool richiama la propria azione, che rilegge file
 * e opzioni correnti (nessun dato vecchio rimandato).
 */
@Component({
  selector: 'app-request-retry',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request().canRetry()) {
      <button type="button" class="rr" (click)="retry.emit()">↻ {{ 'request.retry' | translate }}</button>
    }
  `,
  styles: [`
    .rr {
      margin-top: .5rem; border: 1px solid var(--border-color, #30363d); background: transparent;
      color: var(--text-primary, #e6edf3); border-radius: 999px; padding: .4rem 1.1rem; font-size: .85rem; cursor: pointer;
      &:hover { border-color: var(--primary-500, #4f6af5); color: var(--primary-400, #6b8afc); }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; }
    }
  `],
})
export class RequestRetryComponent {
  readonly request = input.required<TrackedRequest>();
  readonly retry = output<void>();
}
