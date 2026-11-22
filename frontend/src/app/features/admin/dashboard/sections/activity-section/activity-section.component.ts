import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TopPost } from '../../admin-dashboard.service';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';

export interface DayBar {
  date: string;
  value: number;
}

export interface ConsentRates {
  total: number;
  analyticsRate: number;
  marketingRate: number;
  preferencesRate: number;
}

/** Altezza (%) di una colonna del grafico per giorno: mai a zero, così il giorno resta leggibile. */
export function dayBarHeight(value: number, bars: readonly DayBar[]): string {
  const max = Math.max(...bars.map(b => b.value), 1);
  return `${Math.max((value / max) * 100, value > 0 ? 18 : 8)}%`;
}

/** Attività e contenuti: contatti e visite degli ultimi 7 giorni, articoli, consensi. */
@Component({
  selector: 'app-activity-section',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, MatIconModule, TranslateModule, DashboardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activity-section.component.html',
  styleUrls: ['./activity-section.component.scss'],
})
export class ActivitySectionComponent {
  readonly contactBars = input<DayBar[]>([]);
  readonly visitBars = input<DayBar[]>([]);
  readonly totalViews = input(0);
  readonly uniqueVisitors = input(0);
  readonly publishedPosts = input(0);
  readonly draftPosts = input(0);
  readonly topPosts = input<TopPost[]>([]);
  readonly consent = input<ConsentRates>({ total: 0, analyticsRate: 0, marketingRate: 0, preferencesRate: 0 });
  readonly refresh = output<void>();

  readonly dayBarHeight = dayBarHeight;

  private readonly totalContent = computed(() => this.publishedPosts() + this.draftPosts());
  readonly publishedPercent = computed(() => (this.totalContent() ? (this.publishedPosts() / this.totalContent()) * 100 : 0));
  readonly draftPercent = computed(() => (this.totalContent() ? (this.draftPosts() / this.totalContent()) * 100 : 0));
}
