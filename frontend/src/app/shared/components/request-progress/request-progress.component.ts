import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TrackedRequest } from '../../utils/tracked-request';

/**
 * Barra di avanzamento + "Annulla" condivisa dai tool AI del Lab.
 * Durante l'upload mostra la percentuale reale; dopo, una barra
 * indeterminata con "Elaborazione in corso" (il server non espone un
 * avanzamento, e non lo si inventa).
 */
@Component({
  selector: 'app-request-progress',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (request().active()) {
      <div class="rp" aria-live="polite">
        <div class="rp__row">
          <span class="rp__label">
            @if (request().uploading()) {
              {{ 'request.uploading' | translate }}
              @if (request().uploadPercent() !== null) { <strong>{{ request().uploadPercent() }}%</strong> }
            } @else {
              {{ 'request.processing' | translate }}
            }
          </span>
          <button type="button" class="rp__cancel" (click)="cancel.emit()">{{ 'request.cancel' | translate }}</button>
        </div>
        <div class="rp__track" role="progressbar"
             [attr.aria-label]="(request().uploading() ? 'request.uploading' : 'request.processing') | translate"
             aria-valuemin="0" aria-valuemax="100"
             [attr.aria-valuenow]="request().uploading() ? request().uploadPercent() : null">
          @if (request().uploading() && request().uploadPercent() !== null) {
            <div class="rp__bar" [style.width.%]="request().uploadPercent()"></div>
          } @else {
            <div class="rp__bar rp__bar--indeterminate"></div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .rp { display: flex; flex-direction: column; gap: .5rem; margin: 1rem 0; }
    .rp__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; font-size: .88rem; color: var(--text-secondary, #8b949e); }
    .rp__label strong { color: var(--text-primary, #e6edf3); margin-left: .25rem; }
    .rp__cancel {
      border: 1px solid var(--border-color, #30363d); background: transparent; color: var(--text-primary, #e6edf3);
      border-radius: 999px; padding: .3rem .9rem; font-size: .82rem; cursor: pointer;
      &:hover { border-color: var(--color-danger, #ef4444); color: var(--color-danger, #ef4444); }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; }
    }
    .rp__track { position: relative; height: 6px; border-radius: 999px; overflow: hidden; background: var(--bg-tertiary, rgba(127,127,127,.18)); }
    .rp__bar { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #4f6af5, #8b5cf6); transition: width .2s ease; }
    .rp__bar--indeterminate { position: absolute; width: 35%; animation: rp-slide 1.2s ease-in-out infinite; }
    @keyframes rp-slide { from { left: -35%; } to { left: 100%; } }
    @media (prefers-reduced-motion: reduce) { .rp__bar--indeterminate { animation: none; width: 100%; opacity: .5; } }
  `],
})
export class RequestProgressComponent {
  readonly request = input.required<TrackedRequest>();
  readonly cancel = output<void>();
}
