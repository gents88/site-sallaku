import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AdminDashboardService, LeadAttributionReport } from '../admin-dashboard.service';
import { PeriodPickerComponent } from '../components/period-picker/period-picker.component';
import { PeriodDeltaComponent } from '../components/period-delta/period-delta.component';
import { sourceKey } from './acquisition-panel.component';

/** contact_form → lead_attribution.kind_contact_form; tipi sconosciuti → "altro". */
export function leadKindKey(kind: string): string {
  return `lead_attribution.kind_${['contact_form', 'live_handoff'].includes(kind) ? kind : 'other'}`;
}

/**
 * Da dove arrivano i contatti (form e chat live) e quali articoli avevano letto
 * prima di scrivere. Come il pannello Provenienza carica da solo i dati del
 * periodo scelto.
 */
@Component({
  selector: 'app-lead-attribution-panel',
  standalone: true,
  imports: [DecimalPipe, TranslateModule, PeriodPickerComponent, PeriodDeltaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lead-attribution-panel.component.html',
  styleUrls: ['./panel-shared.scss', './lead-attribution-panel.component.scss'],
})
export class LeadAttributionPanelComponent implements OnInit {
  private readonly service = inject(AdminDashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private request: Subscription | null = null;

  readonly days = signal<number>(30);
  readonly report = signal<LeadAttributionReport | null>(null);
  readonly failed = signal(false);

  readonly sourceKey = sourceKey;
  readonly leadKindKey = leadKindKey;

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  /** Ricarica il periodo corrente (aggiornamento automatico della dashboard). */
  reload(): void {
    this.load(false);
  }

  barWidth(count: number, rows: { count: number }[]): number {
    return (count / Math.max(...rows.map(r => r.count), 1)) * 100;
  }

  private load(reset = true): void {
    this.request?.unsubscribe();
    this.failed.set(false);
    if (reset) this.report.set(null);
    this.request = this.service
      .getLeadAttribution(this.days())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => this.report.set(r),
        error: () => this.failed.set(true),
      });
  }
}
