import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';
import { AcquisitionPanelComponent } from '../../panels/acquisition-panel.component';
import { LeadAttributionPanelComponent } from '../../panels/lead-attribution-panel.component';

/** Da dove arrivano i visitatori e i contatti. I due pannelli caricano da soli il periodo scelto. */
@Component({
  selector: 'app-acquisition-section',
  standalone: true,
  imports: [MatIconModule, TranslateModule, DashboardCardComponent, AcquisitionPanelComponent, LeadAttributionPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './acquisition-section.component.html',
  styleUrls: ['./acquisition-section.component.scss'],
})
export class AcquisitionSectionComponent {
  private readonly acquisition = viewChild(AcquisitionPanelComponent);
  private readonly leads = viewChild(LeadAttributionPanelComponent);

  /** Aggiornamento completo della dashboard: ricarica i pannelli senza svuotarli. */
  reload(): void {
    this.acquisition()?.reload();
    this.leads()?.reload();
  }
}
