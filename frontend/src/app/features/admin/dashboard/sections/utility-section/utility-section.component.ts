import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { OperationsInfo, SystemDetails, SystemHealth } from '../../admin-dashboard.service';
import { FeatureFlagsPanelComponent } from '../../panels/feature-flags-panel.component';

export function formatUptimeHours(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  return `${Math.max(0, Math.round(seconds / 3600))}h`;
}

export function formatMemoryMb(memoryMb: number | null | undefined): string {
  if (memoryMb === null || memoryMb === undefined) return '—';
  return `${memoryMb} MB`;
}

export function cronNextRunLabel(nextRun: string | null): string {
  return nextRun ? new Date(nextRun).toLocaleString() : '—';
}

/** Strumenti di amministrazione: rilascio, sicurezza, interruttori, azioni rapide, salute del processo. */
@Component({
  selector: 'app-utility-section',
  standalone: true,
  imports: [DatePipe, MatExpansionModule, MatIconModule, TranslateModule, FeatureFlagsPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './utility-section.component.html',
  styleUrls: ['./utility-section.component.scss'],
})
export class UtilitySectionComponent {
  readonly systemHealth = input<SystemHealth | null>(null);
  readonly systemDetails = input<SystemDetails | null>(null);
  readonly systemOps = input<OperationsInfo | null>(null);
  readonly adminName = input<string | null>(null);
  readonly adminEmail = input<string | null>(null);
  readonly unreadCount = input(0);
  readonly auditCount = input(0);

  readonly refresh = output<void>();
  readonly loadSessions = output<void>();
  readonly downloadCsv = output<void>();
  readonly resetMonthly = output<void>();

  readonly formatUptimeHours = formatUptimeHours;
  readonly formatMemoryMb = formatMemoryMb;
  readonly cronNextRunLabel = cronNextRunLabel;
}
