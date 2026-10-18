import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService, NotFoundSummary } from '../admin-dashboard.service';

/** Link rotti visti dai visitatori: pagine inesistenti e slug di post/progetti che non esistono più. */
@Component({
  selector: 'app-not-found-panel',
  standalone: true,
  imports: [DatePipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`.nf-row { min-width: 0; } .nf-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }`],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-kpis">
        <div class="panel-kpi" [class.panel-kpi--warn]="data.open > 0" [class.panel-kpi--ok]="data.open === 0">
          <strong>{{ data.open }}</strong>
          <span>{{ 'not_found.open' | translate }}</span>
        </div>
      </div>
      @if (data.top.length) {
        <ul class="panel-list">
          @for (hit of data.top; track hit._id) {
            <li>
              <span class="panel-list__main nf-row">
                <span class="panel-mono panel-ellipsis" [title]="hit.path">{{ hit.path }}</span>
                <span class="panel-sub panel-ellipsis">
                  {{ 'not_found.kind_' + hit.kind | translate }} · {{ hit.lastSeenAt | date: 'dd/MM HH:mm' }}
                  @if (hit.lastReferrer) { · {{ 'not_found.from' | translate }} {{ hit.lastReferrer }} }
                </span>
              </span>
              <span class="nf-actions">
                <strong>×{{ hit.count }}</strong>
                <button type="button" class="panel-btn" (click)="dismiss(hit._id)" [disabled]="busy()">{{ 'not_found.dismiss' | translate }}</button>
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="panel-empty">{{ 'not_found.none' | translate }}</p>
      }
      @if (error()) {
        <p class="panel-error" role="alert">{{ 'feature_flags.save_error' | translate }}</p>
      }
    }
  `,
})
export class NotFoundPanelComponent {
  @Input({ required: true }) data!: NotFoundSummary;
  @Input() failed = false;
  @Output() changed = new EventEmitter<void>();

  private readonly api = inject(AdminDashboardService);
  readonly busy = signal(false);
  readonly error = signal(false);

  dismiss(id: string): void {
    this.busy.set(true);
    this.error.set(false);
    this.api.dismissNotFound(id).subscribe({
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
