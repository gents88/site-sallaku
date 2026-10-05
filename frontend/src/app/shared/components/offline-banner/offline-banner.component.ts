import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

const BACK_ONLINE_MS = 3000;

/**
 * Avviso globale di connessione assente. Il guscio dell'app e gli articoli
 * già aperti restano disponibili grazie al service worker: il banner lo
 * dice e porta alla pagina blog, che in quel caso propone gli articoli letti.
 */
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [RouterLink, TranslateModule, LangUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="offline-live" role="status" aria-live="polite">
      @if (!network.online()) {
        <div class="offline-banner">
          <span class="offline-banner__dot" aria-hidden="true"></span>
          <span>{{ 'offline.banner' | translate }}</span>
          <a [routerLink]="'/blog' | langUrl" class="offline-banner__link">{{ 'offline.see_articles' | translate }}</a>
        </div>
      } @else if (backOnline()) {
        <div class="offline-banner offline-banner--ok">
          <span class="offline-banner__dot" aria-hidden="true"></span>
          <span>{{ 'offline.back_online' | translate }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .offline-live {
      position: fixed;
      top: calc(var(--navbar-height, 72px) + 0.5rem);
      left: 50%;
      transform: translateX(-50%);
      z-index: 1100;
      width: max-content;
      max-width: calc(100vw - 2rem);
      pointer-events: none;
    }
    .offline-banner {
      pointer-events: auto;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem 0.75rem;
      padding: 0.55rem 1rem;
      border-radius: 999px;
      background: var(--color-bg-alt, #0f1424);
      color: var(--color-text, #f1f5f9);
      border: 1px solid var(--color-warning, #f59e0b);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
      font-size: 0.875rem;
      animation: offline-in 0.25s ease-out;
    }
    .offline-banner--ok { border-color: var(--color-success, #22c55e); }
    .offline-banner__dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      background: var(--color-warning, #f59e0b);
    }
    .offline-banner--ok .offline-banner__dot { background: var(--color-success, #22c55e); }
    .offline-banner__link { color: var(--color-primary); font-weight: 600; text-decoration: underline; }
    @keyframes offline-in { from { opacity: 0; transform: translateY(-6px); } }
    @media (prefers-reduced-motion: reduce) { .offline-banner { animation: none; } }
  `],
})
export class OfflineBannerComponent {
  readonly network = inject(NetworkStatusService);
  /** Breve conferma dopo essere tornati online (solo se prima si era offline). */
  readonly backOnline = signal(false);

  constructor() {
    let wasOffline = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const online = this.network.online();
      if (!online) {
        wasOffline = true;
        this.backOnline.set(false);
        return;
      }
      if (!wasOffline) return;
      wasOffline = false;
      this.backOnline.set(true);
      clearTimeout(timer);
      timer = setTimeout(() => this.backOnline.set(false), BACK_ONLINE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
