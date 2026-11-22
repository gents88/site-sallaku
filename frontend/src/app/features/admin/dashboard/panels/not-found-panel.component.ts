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
  styleUrls: ['./panel-shared.scss', './not-found-panel.component.scss'],
  templateUrl: './not-found-panel.component.html',
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
