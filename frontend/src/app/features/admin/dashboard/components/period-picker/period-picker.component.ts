import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

export const DASHBOARD_PERIODS = [7, 30, 90] as const;

/** Scelta del periodo (ultimi 7/30/90 giorni) dei pannelli che caricano i propri dati. */
@Component({
  selector: 'app-period-picker',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-picker.component.html',
  styleUrls: ['./period-picker.component.scss'],
})
export class PeriodPickerComponent {
  readonly days = input.required<number>();
  readonly daysChange = output<number>();

  readonly periods = DASHBOARD_PERIODS;

  select(days: number): void {
    if (days !== this.days()) this.daysChange.emit(days);
  }
}
