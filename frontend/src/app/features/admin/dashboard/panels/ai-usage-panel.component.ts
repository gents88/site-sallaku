import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AiUsageOverview } from '../admin-dashboard.service';
import { FeatureFlagsService } from '../../../../core/services/feature-flags.service';
import { sparkline } from '../dashboard-metrics';

/** Livello del consumo rispetto al budget: oltre l'80% avviso, al 100% gli strumenti rispondono 503. */
export function budgetLevel(tokens: number, budget: number): 'ok' | 'warn' | 'bad' {
  if (!budget) return 'ok';
  const pct = tokens / budget;
  return pct >= 1 ? 'bad' : pct >= 0.8 ? 'warn' : 'ok';
}

export function budgetPct(tokens: number, budget: number): number {
  return budget ? Math.min(100, Math.round((tokens / budget) * 100)) : 0;
}

/** Consumo AI di oggi: costa soldi, quindi in vista con l'interruttore per spegnere tutto. */
@Component({
  selector: 'app-ai-usage-panel',
  standalone: true,
  imports: [DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss', './ai-usage-panel.component.scss'],
  templateUrl: './ai-usage-panel.component.html',
})
export class AiUsagePanelComponent {
  @Input({ required: true }) data!: AiUsageOverview;
  @Input() failed = false;

  readonly flags = inject(FeatureFlagsService);
  readonly saving = signal(false);
  readonly error = signal(false);

  get level(): 'ok' | 'warn' | 'bad' {
    return budgetLevel(this.data.tokens, this.data.quota.dailyTokenBudget);
  }

  get pct(): number {
    return budgetPct(this.data.tokens, this.data.quota.dailyTokenBudget);
  }

  get spark(): number[] | null {
    return sparkline(this.data.history.map((h) => ({ count: h.tokens })));
  }

  toggle(input: HTMLInputElement): void {
    const value = input.checked;
    this.saving.set(true);
    this.error.set(false);
    this.flags.update({ aiEnabled: value }).subscribe({
      next: () => this.saving.set(false),
      error: () => {
        this.saving.set(false);
        this.error.set(true);
        input.checked = !value;
      },
    });
  }
}
