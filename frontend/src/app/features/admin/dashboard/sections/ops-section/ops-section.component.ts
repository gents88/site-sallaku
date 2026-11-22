import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AiUsageOverview, OverviewSection, ServerErrorSummary, ServerHealth } from '../../admin-dashboard.service';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';
import { AiUsagePanelComponent } from '../../panels/ai-usage-panel.component';
import { ServerErrorsPanelComponent } from '../../panels/server-errors-panel.component';
import { ServerHealthPanelComponent } from '../../panels/server-health-panel.component';

/** Salute operativa: consumo AI, errori del server, backup e risorse. */
@Component({
  selector: 'app-ops-section',
  standalone: true,
  imports: [MatIconModule, TranslateModule, DashboardCardComponent, AiUsagePanelComponent, ServerErrorsPanelComponent, ServerHealthPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ops-section.component.html',
  styleUrls: ['./ops-section.component.scss'],
})
export class OpsSectionComponent {
  readonly aiUsage = input.required<AiUsageOverview>();
  readonly serverErrors = input.required<ServerErrorSummary>();
  readonly serverHealth = input<ServerHealth | null>(null);
  readonly failed = input<ReadonlySet<OverviewSection>>(new Set());
  /** Un pannello ha cambiato dati sul server (es. errore risolto): va ricaricata la dashboard. */
  readonly changed = output<void>();
}
