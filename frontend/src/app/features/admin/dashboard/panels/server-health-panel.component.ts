import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ServerHealth } from '../admin-dashboard.service';

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function runBadge(conclusion: string | null | undefined): 'ok' | 'warn' | 'bad' {
  if (conclusion === 'success') return 'ok';
  if (conclusion === null || conclusion === undefined) return 'warn';
  return 'bad';
}

/** Backup, RAM, disco, mongod e i workflow GitHub: se qualcosa va storto si vede qui, non da un visitatore. */
@Component({
  selector: 'app-server-health-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .health-warnings { display: grid; gap: 0.4rem; margin: 0 0 1rem; padding: 0; list-style: none; }
    .health-warnings li { padding: 0.5rem 0.7rem; border-radius: 10px; font-size: 0.85rem;
      border: 1px solid var(--color-warning); background: color-mix(in srgb, var(--color-warning) 10%, transparent); }
    .health-ok { margin: 0 0 1rem; font-size: 0.85rem; color: var(--color-success); }
    a { color: var(--color-primary); }
  `],
  template: `
    @if (failed || !data) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      @if (data.warnings.length) {
        <ul class="health-warnings" role="alert">
          @for (w of data.warnings; track w) {
            <li>{{ 'server_health.warn_' + w | translate }}</li>
          }
        </ul>
      } @else {
        <p class="health-ok">{{ 'server_health.all_ok' | translate }}</p>
      }

      <div class="panel-kpis">
        <div class="panel-kpi" [class.panel-kpi--bad]="data.backups.configured && data.backups.stale" [class.panel-kpi--ok]="data.backups.configured && !data.backups.stale">
          @if (data.backups.latest) {
            <strong>{{ data.backups.latest.ageHours | number: '1.0-1' }} h</strong>
            <span>{{ 'server_health.backup_age' | translate: { size: bytes(data.backups.latest.sizeBytes) } }}</span>
          } @else {
            <strong>—</strong>
            <span>{{ (data.backups.configured ? 'server_health.backup_none' : 'server_health.backup_not_configured') | translate }}</span>
          }
        </div>
        <div class="panel-kpi" [class.panel-kpi--bad]="data.memory.low">
          <strong>{{ data.memory.availableMb | number }} MB</strong>
          <span>{{ 'server_health.ram_free' | translate: { total: data.memory.totalMb } }}</span>
        </div>
        @if (data.disk) {
          <div class="panel-kpi" [class.panel-kpi--bad]="data.disk.low">
            <strong>{{ data.disk.freeGb | number: '1.0-1' }} GB</strong>
            <span>{{ 'server_health.disk_free' | translate: { pct: data.disk.usedPct } }}</span>
          </div>
        }
        <div class="panel-kpi">
          <strong>{{ data.mongo.residentMb !== null ? (data.mongo.residentMb | number) + ' MB' : '—' }}</strong>
          <span>{{ 'server_health.mongo_ram' | translate }}</span>
        </div>
      </div>

      <p class="panel-meter-label">
        <span>{{ 'server_health.ram_used' | translate }}</span>
        <strong>{{ data.memory.usedPct }}%</strong>
      </p>
      <div class="panel-meter" [class.panel-meter--warn]="data.memory.usedPct >= 80" [class.panel-meter--bad]="data.memory.low"
        role="meter" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="data.memory.usedPct" [attr.aria-label]="'server_health.ram_used' | translate">
        <div class="panel-meter__fill" [style.width.%]="data.memory.usedPct"></div>
      </div>

      <h3 class="panel-section-title">{{ 'server_health.external' | translate }}</h3>
      @if (data.github.configured) {
        <ul class="panel-list">
          <li>
            <span class="panel-list__main">
              <span>{{ 'server_health.offsite_backup' | translate }}</span>
              @if (data.github.offsiteBackup) {
                <span class="panel-sub">{{ data.github.offsiteBackup.at | date: 'dd/MM HH:mm' }} · <a [href]="data.github.offsiteBackup.url" target="_blank" rel="noopener">GitHub</a></span>
              }
            </span>
            <span class="panel-badge"
              [class.panel-badge--ok]="badge(data.github.offsiteBackup?.conclusion) === 'ok'"
              [class.panel-badge--warn]="badge(data.github.offsiteBackup?.conclusion) === 'warn'"
              [class.panel-badge--bad]="badge(data.github.offsiteBackup?.conclusion) === 'bad'">
              {{ data.github.offsiteBackup?.conclusion ?? ('server_health.running' | translate) }}
            </span>
          </li>
          <li>
            <span class="panel-list__main">
              <span>{{ 'server_health.uptime' | translate }}</span>
              <span class="panel-sub">{{ 'server_health.uptime_checks' | translate: { n: data.github.uptime.checks } }}</span>
            </span>
            <strong>{{ data.github.uptime.successPct !== null ? data.github.uptime.successPct + '%' : '—' }}</strong>
          </li>
        </ul>
      } @else {
        <p class="panel-empty">{{ 'server_health.github_unavailable' | translate }}</p>
      }
      <p class="panel-sub" style="margin-top: 0.75rem">{{ 'server_health.load' | translate }}: {{ data.load.join(' · ') }}</p>
    }
  `,
})
export class ServerHealthPanelComponent {
  @Input({ required: true }) data!: ServerHealth | null;
  @Input() failed = false;

  readonly bytes = formatBytes;
  readonly badge = runBadge;
}
