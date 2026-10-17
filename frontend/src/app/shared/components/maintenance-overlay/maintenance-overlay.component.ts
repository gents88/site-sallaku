import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, map } from 'rxjs';
import { FeatureFlagsService } from '../../../core/services/feature-flags.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';

/** Le pagine admin (login compreso) restano raggiungibili anche in manutenzione. */
export function isMaintenanceExempt(url: string): boolean {
  return url === '/dashboard' || url.startsWith('/dashboard/') || url.startsWith('/dashboard?');
}

/**
 * Avviso a tutta pagina quando la modalità manutenzione è accesa dalla
 * dashboard. Gli admin vedono il sito normalmente (con una pillola che ricorda
 * che i visitatori vedono l'avviso), così possono controllarlo prima di riaprire.
 */
@Component({
  selector: 'app-maintenance-overlay',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="maintenance" role="alertdialog" aria-modal="true" aria-labelledby="maintenance-title">
        <div class="maintenance__card">
          <span class="maintenance__icon" aria-hidden="true">🛠️</span>
          <h1 id="maintenance-title">{{ 'maintenance.title' | translate }}</h1>
          <p>{{ flags.flags().maintenanceMessage || ('maintenance.default_message' | translate) }}</p>
          <button type="button" class="maintenance__login" (click)="authModal.openLogin()">
            {{ 'maintenance.admin_login' | translate }}
          </button>
        </div>
      </div>
    } @else if (adminPreview()) {
      <div class="maintenance-pill" role="status">{{ 'maintenance.admin_notice' | translate }}</div>
    }
  `,
  styles: [`
    .maintenance {
      position: fixed;
      inset: 0;
      z-index: 1500;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      background: var(--color-bg, #0b1020);
    }
    .maintenance__card {
      max-width: 520px;
      text-align: center;
      display: grid;
      gap: 0.85rem;
      justify-items: center;
      color: var(--color-text, #f1f5f9);
    }
    .maintenance__icon { font-size: 2.6rem; }
    .maintenance h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2rem); }
    .maintenance p { margin: 0; color: var(--color-text-muted, #94a3b8); line-height: 1.6; white-space: pre-line; }
    .maintenance__login {
      margin-top: 0.75rem;
      border: 0;
      background: none;
      color: var(--color-text-muted, #94a3b8);
      font-size: 0.8rem;
      text-decoration: underline;
      cursor: pointer;
    }
    .maintenance-pill {
      position: fixed;
      left: 50%;
      bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 1100;
      padding: 0.45rem 0.9rem;
      border-radius: 999px;
      background: var(--color-warning, #f59e0b);
      color: #1f1300;
      font-size: 0.8rem;
      font-weight: 700;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      pointer-events: none;
    }
  `],
})
export class MaintenanceOverlayComponent {
  readonly flags = inject(FeatureFlagsService);
  readonly authModal = inject(AuthModalService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  private readonly active = computed(() => this.flags.maintenanceMode() && !isMaintenanceExempt(this.url()));
  readonly visible = computed(() => this.active() && !this.auth.isAdmin());
  readonly adminPreview = computed(() => this.active() && this.auth.isAdmin());
}
