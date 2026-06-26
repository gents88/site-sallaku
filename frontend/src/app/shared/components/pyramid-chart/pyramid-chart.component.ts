import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DonutItem } from '../donut-chart/donut-chart.component';

export { DonutItem as PyramidItem };

const DEFAULT_COLORS = [
  '#6366f1', '#14b8a6', '#f59e0b', '#ef4444',
  '#06b6d4', '#10b981', '#ec4899', '#8b5cf6',
];

@Component({
  selector: 'app-pyramid-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sorted.length) {
      <div class="pyramid-wrap" aria-label="Pyramid chart">
        @for (item of sorted; track item.label; let i = $index) {
          <div class="pyramid-row" [style.--bar-w]="barWidth(item.count) + '%'">
            <div class="pyramid-bar" [style.background]="colorAt(i)">
              <span class="pyramid-bar__label">{{ item.label }}</span>
              <span class="pyramid-bar__count">{{ item.count }}</span>
            </div>
          </div>
        }
      </div>
    } @else {
      <p class="pyramid-empty text-muted">—</p>
    }
  `,
  styles: [`
    .pyramid-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0.5rem 0;
    }

    .pyramid-row {
      display: flex;
      justify-content: center;
      width: 100%;
    }

    .pyramid-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: var(--bar-w, 100%);
      min-width: 64px;
      padding: 0.38rem 0.75rem;
      border-radius: 6px;
      transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
    }

    .pyramid-bar__label {
      font-size: 0.78rem;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      text-shadow: 0 1px 2px rgba(0,0,0,0.35);
    }

    .pyramid-bar__count {
      font-size: 0.78rem;
      font-weight: 700;
      color: rgba(255,255,255,0.92);
      flex-shrink: 0;
      text-shadow: 0 1px 2px rgba(0,0,0,0.35);
    }

    .pyramid-empty {
      font-size: 0.9rem;
      padding: 1rem 0;
    }
  `],
})
export class PyramidChartComponent {
  @Input() items: DonutItem[] = [];
  @Input() colors: string[] = DEFAULT_COLORS;
  @Input() minWidthPct = 28;

  get sorted(): DonutItem[] {
    return [...this.items].sort((a, b) => b.count - a.count);
  }

  get maxCount(): number {
    return Math.max(...this.items.map(i => i.count), 1);
  }

  barWidth(count: number): number {
    const ratio = count / this.maxCount;
    return this.minWidthPct + ratio * (100 - this.minWidthPct);
  }

  colorAt(i: number): string {
    return this.colors[i % this.colors.length];
  }
}
