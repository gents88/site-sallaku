import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  BOOLEAN_FEATURE_FLAGS,
  BooleanFeatureFlag,
  FeatureFlags,
  FeatureFlagsService,
} from '../../../../core/services/feature-flags.service';

/** Interruttori del sito, senza deploy: ogni modifica è subito attiva (PATCH /system/flags). */
@Component({
  selector: 'app-feature-flags-panel',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flags">
      @for (key of keys; track key) {
        <li class="flags__row" [class.flags__row--warn]="isWarning(key)">
          <div class="flags__text">
            <label class="flags__label" [for]="'flag-' + key">{{ 'feature_flags.' + key | translate }}</label>
            <span class="flags__desc text-muted">{{ 'feature_flags.' + key + '_desc' | translate }}</span>
          </div>
          <input
            type="checkbox"
            role="switch"
            class="panel-switch"
            [id]="'flag-' + key"
            [checked]="service.flags()[key]"
            [disabled]="saving() === key"
            [attr.aria-checked]="service.flags()[key]"
            (change)="toggle(key, $any($event.target))"
          />
        </li>
      }
    </ul>

    <div class="flags__message">
      <label for="flag-maintenance-message">{{ 'feature_flags.maintenance_message' | translate }}</label>
      <textarea
        id="flag-maintenance-message"
        rows="2"
        maxlength="300"
        [(ngModel)]="message"
        [placeholder]="'maintenance.default_message' | translate"
      ></textarea>
      <button type="button" class="panel-btn" (click)="saveMessage()" [disabled]="saving() === 'maintenanceMessage' || message === service.flags().maintenanceMessage">
        {{ 'feature_flags.save_message' | translate }}
      </button>
    </div>

    @if (error()) {
      <p class="panel-error" role="alert">{{ 'feature_flags.save_error' | translate }}</p>
    }
  `,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .flags { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .flags__row {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 0.65rem 0.8rem; border-radius: 12px; border: 1px solid var(--color-border);
    }
    .flags__row--warn { border-color: var(--color-warning); }
    .flags__text { display: grid; gap: 0.15rem; min-width: 0; }
    .flags__label { font-weight: 600; cursor: pointer; }
    .flags__desc { font-size: 0.8rem; }
    .flags__row--warn .panel-switch:checked { background: var(--color-warning); }
    .flags__message { display: grid; gap: 0.45rem; margin-top: 1rem; }
    .flags__message label { font-weight: 600; font-size: 0.9rem; }
    .flags__message textarea {
      width: 100%; box-sizing: border-box; resize: vertical; padding: 0.6rem 0.75rem; border-radius: 10px;
      border: 1px solid var(--color-border); background: transparent; color: inherit; font: inherit;
    }
    .flags__message button { justify-self: start; }
  `],
})
export class FeatureFlagsPanelComponent {
  readonly service = inject(FeatureFlagsService);
  readonly keys = BOOLEAN_FEATURE_FLAGS;
  readonly saving = signal<keyof FeatureFlags | null>(null);
  readonly error = signal(false);
  message = '';

  constructor() {
    // Il campo segue il valore salvato finché l'admin non lo modifica.
    let lastSaved = '';
    effect(() => {
      const saved = this.service.flags().maintenanceMessage;
      if (this.message === lastSaved) this.message = saved;
      lastSaved = saved;
    });
  }

  /** Manutenzione accesa = avviso; qualsiasi altra funzione spenta = avviso. */
  isWarning(key: BooleanFeatureFlag): boolean {
    const on = this.service.flags()[key];
    return key === 'maintenanceMode' ? on : !on;
  }

  toggle(key: BooleanFeatureFlag, input: HTMLInputElement): void {
    const value = input.checked;
    // Se il salvataggio fallisce l'interruttore torna dov'era: il binding
    // [checked] non lo farebbe da solo, il valore nel signal non è cambiato.
    this.save(key, { [key]: value }, () => (input.checked = !value));
  }

  saveMessage(): void {
    this.save('maintenanceMessage', { maintenanceMessage: this.message.trim() });
  }

  private save(key: keyof FeatureFlags, patch: Partial<FeatureFlags>, revert?: () => void): void {
    this.saving.set(key);
    this.error.set(false);
    this.service.update(patch).subscribe({
      next: () => this.saving.set(null),
      error: () => {
        this.saving.set(null);
        this.error.set(true);
        revert?.();
      },
    });
  }
}
