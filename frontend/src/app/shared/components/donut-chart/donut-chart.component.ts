import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DonutItem {
  label: string;
  count: number;
}

const DEFAULT_COLORS = [
  '#6366f1', '#14b8a6', '#f59e0b', '#ef4444',
  '#06b6d4', '#10b981', '#ec4899', '#8b5cf6',
];

/**
 * Pure-CSS donut chart using conic-gradient.
 * No external chart library required.
 */
@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items.length) {
      <div class="donut-wrap">
        <div class="donut" [style.background]="gradient" aria-hidden="true">
          <div class="donut-hole">
            <strong>{{ total }}</strong>
            <span>total</span>
          </div>
        </div>
        <ul class="donut-legend" role="list">
          @for (item of items; track item.label; let i = $index) {
            <li class="donut-legend__item">
              <span class="donut-legend__dot" [style.background]="colorAt(i)"></span>
              <span class="donut-legend__label">{{ item.label }}</span>
              <strong class="donut-legend__pct">{{ pct(item.count) }}%</strong>
            </li>
          }
        </ul>
      </div>
    } @else {
      <p class="donut-empty text-muted">—</p>
    }
  `,
  styles: [`
    .donut-wrap {
      display: flex;
      align-items: center;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .donut {
      position: relative;
      width: 110px;
      height: 110px;
      min-width: 110px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .donut-hole {
      position: absolute;
      inset: 22%;
      border-radius: 50%;
      background: var(--panel-surface, #0d1221);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;

      strong {
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1;
      }

      span {
        font-size: 0.65rem;
        color: var(--color-text-muted);
      }
    }

    .donut-legend {
      flex: 1;
      min-width: 100px;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .donut-legend__item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.82rem;
    }

    .donut-legend__dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .donut-legend__label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--color-text-muted);
    }

    .donut-legend__pct {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--color-text);
    }

    .donut-empty {
      font-size: 0.85rem;
      padding: 0.5rem 0;
    }
  `],
})
export class DonutChartComponent {
  @Input() items: DonutItem[] = [];
  @Input() colors: string[] = DEFAULT_COLORS;

  get total(): number {
    return this.items.reduce((s, i) => s + i.count, 0);
  }

  get gradient(): string {
    if (!this.total) return 'var(--color-border, rgba(255,255,255,0.06))';
    let acc = 0;
    const segs = this.items.map((item, i) => {
      const p = (item.count / this.total) * 100;
      const start = acc;
      acc += p;
      return `${this.colorAt(i)} ${start.toFixed(2)}% ${acc.toFixed(2)}%`;
    });
    return `conic-gradient(from 0deg, ${segs.join(', ')})`;
  }

  colorAt(i: number): string {
    return this.colors[i % this.colors.length];
  }

  pct(count: number): number {
    return this.total ? Math.round((count / this.total) * 100) : 0;
  }
}
