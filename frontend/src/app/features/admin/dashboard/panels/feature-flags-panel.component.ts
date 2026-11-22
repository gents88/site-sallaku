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
  templateUrl: './feature-flags-panel.component.html',
  styleUrls: ['./panel-shared.scss', './feature-flags-panel.component.scss'],
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
