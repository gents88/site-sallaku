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
            class="flags__switch"
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
      <button type="button" class="utility-action-btn" (click)="saveMessage()" [disabled]="saving() === 'maintenanceMessage' || message === service.flags().maintenanceMessage">
        {{ 'feature_flags.save_message' | translate }}
      </button>
    </div>

    @if (error()) {
      <p class="flags__error" role="alert">{{ 'feature_flags.save_error' | translate }}</p>
    }
  `,
  styles: [`
    .flags { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .flags__row {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 0.65rem 0.8rem; border-radius: 12px;
      border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.16));
    }
    .flags__row--warn { border-color: var(--color-warning, #f59e0b); }
    .flags__text { display: grid; gap: 0.15rem; min-width: 0; }
    .flags__label { font-weight: 600; cursor: pointer; }
    .flags__desc { font-size: 0.8rem; }
    .flags__switch {
      appearance: none; flex-shrink: 0; width: 42px; height: 24px; border-radius: 999px; margin: 0;
      background: var(--border-strong, rgba(148, 163, 184, 0.4)); position: relative; cursor: pointer;
      transition: background 0.2s ease;
    }
    .flags__switch::after {
      content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
      background: #fff; transition: transform 0.2s ease;
    }
    .flags__switch:checked { background: var(--color-success, #22c55e); }
    .flags__switch:checked::after { transform: translateX(18px); }
    .flags__switch:disabled { opacity: 0.5; cursor: wait; }
    .flags__switch:focus-visible { outline: 2px solid var(--color-primary, #6366f1); outline-offset: 2px; }
    .flags__row--warn .flags__switch:checked { background: var(--color-warning, #f59e0b); }
    .flags__message { display: grid; gap: 0.45rem; margin-top: 1rem; }
    .flags__message label { font-weight: 600; font-size: 0.9rem; }
    .flags__message textarea {
      width: 100%; box-sizing: border-box; resize: vertical; padding: 0.6rem 0.75rem; border-radius: 10px;
      border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.24)); background: transparent; color: inherit; font: inherit;
    }
    .flags__message button { justify-self: start; }
    .flags__error { color: var(--color-error, #ef4444); margin: 0.75rem 0 0; font-size: 0.85rem; }
    @media (prefers-reduced-motion: reduce) { .flags__switch, .flags__switch::after { transition: none; } }
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
