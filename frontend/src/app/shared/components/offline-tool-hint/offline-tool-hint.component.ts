import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkStatusService } from '../../../core/services/network-status.service';

/**
 * Avviso per i tool che elaborano i file sul server (riassunto, formattazione,
 * traduzione, presentazioni): senza connessione il pulsante d'azione viene
 * disabilitato dal tool stesso e questo messaggio spiega perché, invece di far
 * partire un upload che fallisce dopo il timeout. Non compare se si è online.
 */
@Component({
  selector: 'app-offline-tool-hint',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!network.online()) {
      <p class="oth" role="status">📡 {{ 'offline.tool_needs_connection' | translate }}</p>
    }
  `,
  styles: [`
    .oth {
      margin: .75rem 0 .5rem; padding: .6rem .9rem; border-radius: 10px; font-size: .88rem; line-height: 1.5;
      color: var(--text-primary, #e6edf3); background: rgba(245, 158, 11, .12); border: 1px solid var(--color-warning, #f59e0b);
    }
  `],
})
export class OfflineToolHintComponent {
  readonly network = inject(NetworkStatusService);
}
