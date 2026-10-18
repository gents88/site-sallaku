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
  styleUrls: ['./panel-shared.scss'],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-switch-row" [class.panel-switch-row--off]="!flags.flags().aiEnabled">
        <label for="ai-kill-switch">{{ (flags.flags().aiEnabled ? 'ai_usage.switch_on' : 'ai_usage.switch_off') | translate }}</label>
        <input
          id="ai-kill-switch"
          type="checkbox"
          role="switch"
          class="panel-switch"
          [checked]="flags.flags().aiEnabled"
          [attr.aria-checked]="flags.flags().aiEnabled"
          [disabled]="saving()"
          (change)="toggle($any($event.target))"
        />
      </div>

      <p class="panel-meter-label">
        <span>{{ 'ai_usage.tokens_today' | translate }}</span>
        <strong>{{ data.tokens | number }} / {{ data.quota.dailyTokenBudget | number }}</strong>
      </p>
      <div
        class="panel-meter"
        [class.panel-meter--warn]="level === 'warn'"
        [class.panel-meter--bad]="level === 'bad'"
        role="meter"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-valuenow]="pct"
        [attr.aria-label]="'ai_usage.tokens_today' | translate"
      >
        <div class="panel-meter__fill" [style.width.%]="pct"></div>
      </div>

      <div class="panel-kpis" style="margin-top: 1rem">
        <div class="panel-kpi">
          <strong>{{ data.calls | number }}</strong>
          <span>{{ 'ai_usage.calls_today' | translate }}</span>
        </div>
        <div class="panel-kpi">
          <strong>{{ data.tokensBySource.chatbot | number }}</strong>
          <span>{{ 'ai_usage.chatbot_tokens' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--warn]="data.rejectedIpCap > 0">
          <strong>{{ data.rejectedIpCap | number }}</strong>
          <span>{{ 'ai_usage.rejected_ip' | translate: { cap: data.quota.maxCallsPerIpPerDay } }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--bad]="data.rejectedBudget > 0">
          <strong>{{ data.rejectedBudget | number }}</strong>
          <span>{{ 'ai_usage.rejected_budget' | translate }}</span>
        </div>
      </div>

      @if (data.cappedIps > 0) {
        <p class="panel-sub">{{ 'ai_usage.capped_ips' | translate: { n: data.cappedIps } }}</p>
      }

      @if (spark) {
        <h3 class="panel-section-title">{{ 'ai_usage.last_7_days' | translate }}</h3>
        <div class="panel-spark" aria-hidden="true">
          @for (h of spark; track $index) {
            <span [style.height.%]="h" [title]="data.history[$index].date + ': ' + (data.history[$index].tokens | number)"></span>
          }
        </div>
      }

      <h3 class="panel-section-title">{{ 'ai_usage.by_tool' | translate }}</h3>
      @if (data.byEndpoint.length) {
        <ul class="panel-list">
          @for (row of data.byEndpoint; track row.endpoint) {
            <li><span class="panel-mono">{{ row.endpoint }}</span><strong>{{ row.calls | number }}</strong></li>
          }
        </ul>
      } @else {
        <p class="panel-empty">{{ 'ai_usage.no_calls' | translate }}</p>
      }

      @if (error()) {
        <p class="panel-error" role="alert">{{ 'feature_flags.save_error' | translate }}</p>
      }
    }
  `,
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
