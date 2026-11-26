import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AdminDashboardService, ServerErrorSummary, ServerErrorView } from '../admin-dashboard.service';
import { ErrorExplanation, explainServerError } from './explain-server-error';

/** Ultimi errori 5xx raggruppati: senza Sentry è l'unico modo di sapere che qualcosa si è rotto. */
@Component({
  selector: 'app-server-errors-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss', './server-errors-panel.component.scss'],
  templateUrl: './server-errors-panel.component.html',
})
export class ServerErrorsPanelComponent {
  @Input({ required: true }) data!: ServerErrorSummary;
  @Input() failed = false;
  /** Dopo un'azione la dashboard ricarica lo snapshot (saltando la cache). */
  @Output() changed = new EventEmitter<void>();

  private readonly api = inject(AdminDashboardService);
  readonly expanded = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);

  /** Spiegazione in parole semplici (solo italiano: la legge solo chi amministra il sito). */
  explain(e: ServerErrorView): ErrorExplanation {
    return explainServerError(e);
  }

  toggle(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  resolve(id: string): void {
    this.run(this.api.resolveServerError(id));
  }

  resolveAll(): void {
    this.run(this.api.resolveAllServerErrors());
  }

  private run(req: Observable<unknown>): void {
    this.busy.set(true);
    this.error.set(false);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.changed.emit();
      },
      error: () => {
        this.busy.set(false);
        this.error.set(true);
      },
    });
  }
}
