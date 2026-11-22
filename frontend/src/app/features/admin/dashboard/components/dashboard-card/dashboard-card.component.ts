import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Card della dashboard: titolo, descrizione, icona ed etichetta del periodo a
 * cui si riferiscono i dati ("Oggi", "Ultimi 30 giorni", "Da sempre"…). Il
 * contenuto si proietta; un'azione nell'intestazione va con l'attributo `cardAction`.
 */
@Component({
  selector: 'app-dashboard-card',
  standalone: true,
  imports: [MatIconModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-card.component.html',
  styleUrls: ['./dashboard-card.component.scss'],
  host: { '[class.dashboard-card--wide]': 'wide()' },
})
export class DashboardCardComponent {
  /** Chiave i18n del titolo */
  readonly titleKey = input.required<string>();
  /** Chiave i18n della descrizione */
  readonly descKey = input<string | null>(null);
  readonly icon = input<string | null>(null);
  /** Chiave i18n del periodo dei dati (dashboard_ux.period_*) */
  readonly periodKey = input<string | null>(null);
  /** Occupa tutta la larghezza della griglia */
  readonly wide = input(false);
}
