import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SearchConsoleSummary } from '../../admin-dashboard.service';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';
import { barPercent } from '../../dashboard-metrics';
import { SERIES_COLORS } from '../visitors-section/visitors-section.component';

/** URL completo di Search Console → solo il percorso, più leggibile nella barra. */
export function gscPagePath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname) || '/';
  } catch {
    return url;
  }
}

/** Google Search Console: clic, impressioni, ricerche e pagine (ultimi 28 giorni). */
@Component({
  selector: 'app-seo-section',
  standalone: true,
  imports: [DecimalPipe, TranslateModule, DashboardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seo-section.component.html',
  styleUrls: ['./seo-section.component.scss'],
})
export class SeoSectionComponent {
  readonly gsc = input.required<SearchConsoleSummary>();

  readonly colors = SERIES_COLORS;
  readonly gscPagePath = gscPagePath;
  readonly topPages = computed(() => this.gsc().topPages ?? []);

  queryBar(clicks: number): number {
    return barPercent(clicks, this.gsc().topQueries.map(q => q.clicks), 0);
  }

  pageBar(clicks: number): number {
    return barPercent(clicks, this.topPages().map(p => p.clicks), 0);
  }
}
