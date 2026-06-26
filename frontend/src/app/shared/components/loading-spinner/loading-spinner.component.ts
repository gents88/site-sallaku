import { Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="spinner-wrapper">
      <mat-spinner diameter="48" />
    </div>
  `,
  styles: [`
    .spinner-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4rem;
    }
  `],
})
export class LoadingSpinnerComponent {}
