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
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .acq__periods { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .acq__period[aria-pressed='true'] { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    .acq__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem; }
    .acq__subtitle { font-size: 0.85rem; font-weight: 700; margin: 0 0 0.6rem; }
    .acq__bar-row { display: grid; grid-template-columns: minmax(0, 1fr) 2fr auto; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; font-size: 0.8rem; }
    .acq__bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .acq__bar-track { height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--color-text-muted) 18%, transparent); overflow: hidden; }
    .acq__bar-fill { height: 100%; border-radius: inherit; background: var(--color-primary); }
    .acq__table-wrap { overflow-x: auto; }
    .acq__table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .acq__table th, .acq__table td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
    .acq__table th { font-weight: 600; color: var(--color-text-muted); white-space: nowrap; }
    .acq__path { font-family: monospace; word-break: break-all; }
    .acq__chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .acq__chip { padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.7rem; background: color-mix(in srgb, var(--color-primary) 12%, transparent); white-space: nowrap; }
    .acq__muted { color: var(--color-text-muted); }
    .acq__num { text-align: right; white-space: nowrap; }
  `],
  template: `
    <div class="acq__periods" role="group" [attr.aria-label]="'acquisition.period' | translate">
      @for (d of periods; track d) {
        <button type="button" class="panel-btn acq__period" [attr.aria-pressed]="days() === d" (click)="setDays(d)">
          {{ 'acquisition.last_days' | translate: { days: d } }}
        </button>
      }
    </div>

    @if (failed()) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else if (report(); as r) {
      <div class="panel-kpis">
        <div class="panel-kpi panel-kpi--ok">
          <strong>{{ r.totalEntries | number }}</strong>
          <span>{{ 'acquisition.total_entries' | translate }}</span>
        </div>
        @for (s of r.sources; track s.label) {
          <div class="panel-kpi">
            <strong>{{ s.count | number }}</strong>
            <span>{{ sourceKey(s.label) | translate }}</span>
          </div>
        }
      </div>

      <div class="acq__grid">
        <div>
          <h3 class="acq__subtitle">{{ 'acquisition.referrers' | translate }}</h3>
          @for (ref of r.referrers; track ref.label) {
            <div class="acq__bar-row">
              <span class="acq__bar-label" [title]="ref.label">{{ ref.label }}</span>
              <div class="acq__bar-track"><div class="acq__bar-fill" [style.width.%]="barWidth(ref.count, r.referrers)"></div></div>
              <span class="acq__num">{{ ref.count | number }}</span>
            </div>
          } @empty {
            <p class="acq__muted">{{ 'acquisition.no_referrers' | translate }}</p>
          }
        </div>

        <div>
          <h3 class="acq__subtitle">{{ 'acquisition.entry_pages' | translate }}</h3>
          <div class="acq__table-wrap">
            <table class="acq__table">
              <thead>
                <tr>
                  <th>{{ 'acquisition.page' | translate }}</th>
                  <th>{{ 'acquisition.from' | translate }}</th>
                  <th class="acq__num">{{ 'acquisition.entries' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (p of r.entryPages; track p.path) {
                  <tr>
                    <td class="acq__path">{{ p.path }}</td>
                    <td>
                      <span class="acq__chips">
                        @for (s of sortedSources(p.sources); track s.source) {
                          <span class="acq__chip">{{ sourceKey(s.source) | translate }} {{ s.count }}</span>
                        }
                      </span>
                    </td>
                    <td class="acq__num">{{ p.entries | number }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="acq__muted">{{ 'admin.no_chart_data' | translate }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h3 class="acq__subtitle">{{ 'acquisition.recent_visits' | translate }}</h3>
      <div class="acq__table-wrap">
        <table class="acq__table">
          <thead>
            <tr>
              <th>{{ 'acquisition.when' | translate }}</th>
              <th>{{ 'acquisition.from' | translate }}</th>
              <th>{{ 'acquisition.landing' | translate }}</th>
              <th>{{ 'acquisition.where' | translate }}</th>
              <th>{{ 'acquisition.device' | translate }}</th>
              <th class="acq__num">{{ 'acquisition.pages' | translate }}</th>
              <th class="acq__num">{{ 'acquisition.duration' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (v of r.recentVisits; track $index) {
              <tr>
                <td style="white-space:nowrap">{{ v.at | date: 'dd/MM HH:mm' }}</td>
                <td>
                  {{ sourceKey(v.trafficSource) | translate }}
                  @if (v.referrerHost || v.utmSource) {
                    <span class="acq__muted"> · {{ v.utmSource || v.referrerHost }}</span>
                  }
                </td>
                <td class="acq__path">{{ v.entryPath }}</td>
                <td>{{ v.city ? v.city + ', ' : '' }}{{ v.country || '—' }}</td>
                <td>{{ v.deviceType || '—' }}</td>
                <td class="acq__num">{{ v.pages }}</td>
                <td class="acq__num">{{ formatDuration(v.durationSec) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="acq__muted">{{ 'admin.no_chart_data' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p class="acq__muted">{{ 'acquisition.loading' | translate }}</p>
    }
  `,
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
