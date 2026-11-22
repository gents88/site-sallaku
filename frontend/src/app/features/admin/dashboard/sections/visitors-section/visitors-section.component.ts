import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ChatbotStats, MonthlyHistoryEntry, TopPage, ToolConversionRow } from '../../admin-dashboard.service';
import { DonutChartComponent, DonutItem } from '../../../../../shared/components/donut-chart/donut-chart.component';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';
import { barPercent } from '../../dashboard-metrics';

/** Tutto quello che mostra la sezione Visitatori, preparato dalla dashboard. */
export interface VisitorStats {
  totalViews: number;
  monthlyViews: number;
  lastResetAt: string | null;
  todayVisitors: number;
  uniqueVisitors: number;
  /** Contatori pre-aggregati: per paese e per dispositivo, del mese e complessivi */
  statsLocations: DonutItem[];
  statsMonthlyLocations: DonutItem[];
  statsDevices: DonutItem[];
  statsMonthlyDevices: DonutItem[];
  /** Dalle visite registrate */
  osBreakdown: DonutItem[];
  trafficSources: DonutItem[];
  topLocations: DonutItem[];
  topCountries: DonutItem[];
  browserBreakdown: DonutItem[];
  /** Mesi passati + mese corrente */
  trend: MonthlyHistoryEntry[];
  chatbotStats: ChatbotStats;
  topPages: TopPage[];
  toolConversion: ToolConversionRow[];
}

export const TRAFFIC_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444'];
export const DEVICE_COLORS = ['#06b6d4', '#ec4899', '#10b981'];
export const BROWSER_COLORS = ['#f59e0b', '#6366f1', '#ef4444', '#14b8a6', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899'];
export const SERIES_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6', '#0ea5e9', '#a78bfa'];

/** Statistiche dei visitatori: contatori, provenienza geografica, dispositivi, pagine, tool. */
@Component({
  selector: 'app-visitors-section',
  standalone: true,
  imports: [DatePipe, MatIconModule, TranslateModule, DonutChartComponent, DashboardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visitors-section.component.html',
  styleUrls: ['./visitors-section.component.scss'],
})
export class VisitorsSectionComponent {
  readonly stats = input.required<VisitorStats>();
  readonly resetting = input(false);
  readonly resetMonthly = output<void>();
  readonly downloadCsv = output<void>();

  readonly trafficColors = TRAFFIC_COLORS;
  readonly deviceColors = DEVICE_COLORS;
  readonly browserColors = BROWSER_COLORS;
  readonly seriesColors = SERIES_COLORS;

  /** Larghezza della barra di `value` rispetto alla serie `items`. */
  bar(value: number, items: readonly { count: number }[], minPct = 6): number {
    return barPercent(value, items.map(i => i.count), minPct);
  }

  trendBar(views: number): number {
    return barPercent(views, this.stats().trend.map(t => t.views), 4);
  }
}
