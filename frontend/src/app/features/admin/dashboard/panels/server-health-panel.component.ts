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
  styleUrls: ['./panel-shared.scss', './server-health-panel.component.scss'],
  templateUrl: './server-health-panel.component.html',
})
export class ServerHealthPanelComponent {
  @Input({ required: true }) data!: ServerHealth | null;
  @Input() failed = false;

  readonly bytes = formatBytes;
  readonly badge = runBadge;
}
