import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { periodDelta } from '../../dashboard-metrics';

/** "+18% rispetto ai 30 giorni prima": confronto di un numero con il periodo precedente. */
@Component({
  selector: 'app-period-delta',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './period-delta.component.html',
  styleUrls: ['./period-delta.component.scss'],
})
export class PeriodDeltaComponent {
  readonly current = input.required<number>();
  readonly previous = input.required<number>();
  readonly days = input.required<number>();

  readonly delta = computed(() => periodDelta(this.current(), this.previous()));
}
