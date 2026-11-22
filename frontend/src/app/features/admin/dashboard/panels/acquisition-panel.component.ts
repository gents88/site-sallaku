import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AcquisitionReport, AdminDashboardService } from '../admin-dashboard.service';

export const ACQUISITION_PERIODS = [7, 30, 90] as const;

/** Sorgenti note: le altre (valori vecchi o futuri) si mostrano come "Altro". */
const KNOWN_SOURCES = ['search', 'social', 'referral', 'direct', 'campaign', 'internal'];

export function sourceKey(source: string): string {
  return `acquisition.source_${KNOWN_SOURCES.includes(source) ? source : 'other'}`;
}

/** "1 min 35 s" / "42 s"; null → "—". */
export function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest ? `${min} min ${rest} s` : `${min} min`;
}

/** Sorgenti di una pagina d'ingresso, dalla più frequente. */
export function sortedSources(sources: Record<string, number>): { source: string; count: number }[] {
  return Object.entries(sources)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Da dove arrivano i visitatori (sorgente e sito), su quale pagina entrano e le
 * ultime visite. Carica da solo i propri dati perché ha un periodo suo (7/30/90
 * giorni), indipendente dallo snapshot della dashboard.
 */
@Component({
  selector: 'app-acquisition-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss', './acquisition-panel.component.scss'],
  templateUrl: './acquisition-panel.component.html',
})
export class AcquisitionPanelComponent implements OnInit {
  private readonly service = inject(AdminDashboardService);
  private readonly destroyRef = inject(DestroyRef);
  private request: Subscription | null = null;

  readonly periods = ACQUISITION_PERIODS;
  readonly days = signal<number>(30);
  readonly report = signal<AcquisitionReport | null>(null);
  readonly failed = signal(false);

  readonly sourceKey = sourceKey;
  readonly sortedSources = sortedSources;
  readonly formatDuration = formatDuration;

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    if (days === this.days()) return;
    this.days.set(days);
    this.load();
  }

  barWidth(count: number, rows: { count: number }[]): number {
    const max = Math.max(...rows.map(r => r.count), 1);
    return (count / max) * 100;
  }

  private load(): void {
    this.request?.unsubscribe();
    this.failed.set(false);
    this.report.set(null);
    this.request = this.service
      .getAcquisition(this.days())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => this.report.set(r),
        error: () => this.failed.set(true),
      });
  }
}
