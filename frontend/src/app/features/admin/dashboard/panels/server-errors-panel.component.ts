import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AdminDashboardService, ServerErrorSummary } from '../admin-dashboard.service';

/** Ultimi errori 5xx raggruppati: senza Sentry è l'unico modo di sapere che qualcosa si è rotto. */
@Component({
  selector: 'app-server-errors-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .err-row { display: grid; gap: 0.35rem; }
    .err-row__head { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .err-row__route { min-width: 0; flex: 1; }
    .err-row__msg { font-size: 0.8rem; overflow-wrap: anywhere; }
    .err-row__actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .err-stack { margin: 0; max-height: 220px; overflow: auto; padding: 0.6rem; border-radius: 8px;
      background: color-mix(in srgb, var(--color-text-muted) 10%, transparent); font-size: 0.72rem; white-space: pre-wrap; }
    .panel-list > li { display: block; }
  `],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-kpis">
        <div class="panel-kpi" [class.panel-kpi--bad]="data.open > 0" [class.panel-kpi--ok]="data.open === 0">
          <strong>{{ data.open | number }}</strong>
          <span>{{ 'server_errors.open' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--warn]="data.today > 0">
          <strong>{{ data.today | number }}</strong>
          <span>{{ 'server_errors.today' | translate }}</span>
        </div>
        <div class="panel-kpi">
          <strong>{{ data.week | number }}</strong>
          <span>{{ 'server_errors.week' | translate }}</span>
        </div>
      </div>

      @if (data.recent.length) {
        <ul class="panel-list">
          @for (e of data.recent; track e._id) {
            <li class="err-row">
              <div class="err-row__head">
                <span class="panel-badge panel-badge--bad">{{ e.status }}</span>
                <span class="err-row__route panel-mono panel-ellipsis" [title]="e.path">{{ e.method }} {{ e.route }}</span>
                <strong [title]="'server_errors.total' | translate">×{{ e.count | number }}</strong>
              </div>
              <span class="err-row__msg">{{ e.name }}: {{ e.message || '—' }}</span>
              <span class="panel-sub">{{ 'server_errors.last_seen' | translate }} {{ e.lastSeenAt | date: 'dd/MM HH:mm' }} · {{ 'server_errors.today_count' | translate: { n: e.today } }}</span>
              @if (expanded() === e._id && e.stack) {
                <pre class="err-stack">{{ e.stack }}</pre>
              }
              <div class="err-row__actions">
                @if (e.stack) {
                  <button type="button" class="panel-btn" (click)="toggle(e._id)" [attr.aria-expanded]="expanded() === e._id">
                    {{ (expanded() === e._id ? 'server_errors.hide_stack' : 'server_errors.show_stack') | translate }}
                  </button>
                }
                <button type="button" class="panel-btn" (click)="resolve(e._id)" [disabled]="busy()">{{ 'server_errors.resolve' | translate }}</button>
              </div>
            </li>
          }
        </ul>
        <div class="panel-actions">
          <button type="button" class="panel-btn panel-btn--danger" (click)="resolveAll()" [disabled]="busy()">{{ 'server_errors.resolve_all' | translate }}</button>
        </div>
      } @else {
        <p class="panel-empty">{{ 'server_errors.none' | translate }}</p>
      }

      @if (error()) {
        <p class="panel-error" role="alert">{{ 'feature_flags.save_error' | translate }}</p>
      }
    }
  `,
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
