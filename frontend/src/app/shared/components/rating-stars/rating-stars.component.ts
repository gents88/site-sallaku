import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-rating-stars',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rating-stars.component.html',
  styleUrls: ['./rating-stars.component.scss'],
})
export class RatingStarsComponent {
  @Input() value = 0;
  @Input() readonly = true;
  @Input() max = 5;
  @Input() ariaLabel = 'Valutazione';
  @Output() valueChange = new EventEmitter<number>();

  hovered = signal<number | null>(null);

  get stars(): number[] {
    return Array.from({ length: this.max }, (_, i) => i + 1);
  }

  displayValue(star: number): boolean {
    const preview = this.hovered();
    return preview !== null ? star <= preview : star <= this.value;
  }

  select(star: number): void {
    if (this.readonly) return;
    this.value = star;
    this.valueChange.emit(star);
  }

  onHover(star: number | null): void {
    if (this.readonly) return;
    this.hovered.set(star);
  }
}
