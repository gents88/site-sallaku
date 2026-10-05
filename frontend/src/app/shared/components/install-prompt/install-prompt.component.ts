import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { InstallPromptService } from '../../../core/services/install-prompt.service';

/**
 * Card "Installa l'app": compare solo quando InstallPromptService dice che è
 * il momento (dal secondo strumento del Lab usato, non dopo un rifiuto recente).
 */
@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.shouldOffer() && !hidden()) {
      <aside class="install-card" role="dialog" aria-labelledby="install-card-title" aria-describedby="install-card-text">
        <img src="/favicon.svg" alt="" width="40" height="40" class="install-card__icon" />
        <div class="install-card__body">
          <h2 id="install-card-title">{{ 'install.title' | translate }}</h2>
          @if (install.canPromptNatively()) {
            <p id="install-card-text">{{ 'install.text' | translate }}</p>
          } @else {
            <p id="install-card-text">
              {{ 'install.ios_text_before' | translate }}
              <svg class="install-card__share" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M12 3l4 4h-3v8h-2V7H8l4-4zm-7 9h2v7h10v-7h2v9H5v-9z" />
              </svg>
              <strong>{{ 'install.ios_share' | translate }}</strong>
              {{ 'install.ios_text_after' | translate }}
            </p>
          }
          <div class="install-card__actions">
            @if (install.canPromptNatively()) {
              <button type="button" class="btn btn-primary btn-sm" (click)="installNow()">{{ 'install.cta' | translate }}</button>
            }
            <button type="button" class="btn btn-ghost btn-sm" (click)="later()">{{ 'install.later' | translate }}</button>
          </div>
        </div>
      </aside>
    }
  `,
  styles: [`
    .install-card {
      position: fixed;
      left: 1rem;
      bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
      z-index: 1050;
      display: flex;
      gap: 0.85rem;
      width: min(360px, calc(100vw - 2rem));
      padding: 1rem;
      border-radius: var(--radius-md, 12px);
      background: var(--color-bg-alt, #0f1424);
      color: var(--color-text, #f1f5f9);
      border: 1px solid var(--color-border);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
      animation: install-in 0.3s ease-out;
    }
    @media (max-width: 900px) {
      .install-card { bottom: calc(var(--bottom-tabbar-height, 60px) + 0.75rem + env(safe-area-inset-bottom, 0px)); }
    }
    .install-card__icon { flex-shrink: 0; border-radius: 10px; }
    .install-card__body { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
    h2 { margin: 0; font-size: 1rem; text-transform: none; }
    p { margin: 0; font-size: 0.875rem; line-height: 1.5; color: var(--color-text-muted); }
    .install-card__share { vertical-align: -3px; margin: 0 0.15rem; color: var(--color-primary); }
    .install-card__actions { display: flex; gap: 0.5rem; margin-top: 0.35rem; }
    @keyframes install-in { from { opacity: 0; transform: translateY(12px); } }
    @media (prefers-reduced-motion: reduce) { .install-card { animation: none; } }
  `],
})
export class InstallPromptComponent {
  readonly install = inject(InstallPromptService);
  /** Chiusa in questa sessione (anche dopo un'installazione riuscita o annullata). */
  readonly hidden = signal(false);

  async installNow(): Promise<void> {
    this.hidden.set(true);
    await this.install.install();
  }

  later(): void {
    this.hidden.set(true);
    this.install.dismiss();
  }
}
