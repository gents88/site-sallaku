import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminDashboardService, SecurityEventType, SecuritySession, SecuritySummary } from '../admin-dashboard.service';
import { AuthService } from '../../../../core/services/auth.service';

/** Gravità del badge per tipo di evento: riuso di un token e codici errati pesano più di un login riuscito. */
const EVENT_BADGE: Record<SecurityEventType, string> = {
  login_success: 'panel-badge--ok',
  login_failed: 'panel-badge--warn',
  otp_failed: 'panel-badge--warn',
  refresh_reuse: 'panel-badge--bad',
  session_revoked: '',
};

/**
 * Accessi e sessioni: contatori delle ultime 24 ore, chi è connesso adesso
 * (con "Chiudi sessione") e gli ultimi eventi. Il refresh token è uno per
 * utente, quindi c'è al più una sessione per account.
 */
@Component({
  selector: 'app-security-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .sec-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
    .sec-row__main { min-width: 0; display: grid; gap: 0.15rem; flex: 1; }
    .sec-ips { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 0.5rem 0; }
    .panel-list > li { display: block; }
  `],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-kpis">
        <div class="panel-kpi" [class.panel-kpi--warn]="data.failedLogins24h > 0" [class.panel-kpi--ok]="data.failedLogins24h === 0">
          <strong>{{ data.failedLogins24h | number }}</strong>
          <span>{{ 'security_panel.failed_logins' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--warn]="data.otpFailed24h > 0">
          <strong>{{ data.otpFailed24h | number }}</strong>
          <span>{{ 'security_panel.otp_failed' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--bad]="data.tokenReuse7d > 0" [class.panel-kpi--ok]="data.tokenReuse7d === 0" [title]="'security_panel.reuse_hint' | translate">
          <strong>{{ data.tokenReuse7d | number }}</strong>
          <span>{{ 'security_panel.token_reuse' | translate }}</span>
        </div>
        <div class="panel-kpi">
          <strong>{{ data.activeSessions | number }}</strong>
          <span>{{ 'security_panel.active_sessions' | translate }}</span>
        </div>
      </div>

      @if (data.suspiciousIps.length) {
        <div class="sec-ips" [title]="'security_panel.suspicious_hint' | translate">
          <span class="panel-sub">{{ 'security_panel.suspicious_ips' | translate }}</span>
          @for (item of data.suspiciousIps; track item.ip) {
            <span class="panel-badge panel-badge--bad panel-mono">{{ item.ip }} ×{{ item.failures }}</span>
          }
        </div>
      }

      <h3 class="panel-section-title">{{ 'security_panel.sessions' | translate }}</h3>
      @if (data.sessions.length) {
        <ul class="panel-list">
          @for (s of data.sessions; track s.userId) {
            <li>
              <div class="sec-row">
                <span class="sec-row__main">
                  <span class="panel-ellipsis">
                    <strong>{{ s.name }}</strong>
                    <span class="panel-badge">{{ s.role }}</span>
                    @if (isSelf(s)) { <span class="panel-badge panel-badge--ok">{{ 'security_panel.you' | translate }}</span> }
                  </span>
                  <span class="panel-sub panel-ellipsis">{{ s.device }} · <span class="panel-mono">{{ s.ip || '—' }}</span></span>
                  <span class="panel-sub">
                    {{ 'security_panel.started' | translate }} {{ s.startedAt | date: 'dd/MM HH:mm' }} ·
                    {{ 'security_panel.last_active' | translate }} {{ s.lastSeenAt | date: 'dd/MM HH:mm' }}
                  </span>
                </span>
                @if (!isSelf(s)) {
                  <button type="button" class="panel-btn panel-btn--danger" (click)="close(s)" [disabled]="busyId() !== null">
                    {{ 'security_panel.close_session' | translate }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="panel-empty">{{ 'security_panel.no_sessions' | translate }}</p>
      }

      <h3 class="panel-section-title">{{ 'security_panel.events' | translate }}</h3>
      @if (data.events.length) {
        <ul class="panel-list">
          @for (e of data.events; track e._id) {
            <li>
              <div class="sec-row">
                <span class="sec-row__main">
                  <span class="panel-ellipsis">
                    <span [class]="badgeClass(e.type)">{{ 'security_panel.ev_' + e.type | translate }}</span>
                    @if (e.identifier) { <span class="panel-mono">{{ e.identifier }}</span> }
                  </span>
                  <span class="panel-sub panel-ellipsis">
                    <span class="panel-mono">{{ e.ip || '—' }}</span> · {{ e.device }}@if (e.detail) { · {{ e.detail }} }
                  </span>
                </span>
                <span class="panel-sub">{{ e.createdAt | date: 'dd/MM HH:mm' }}</span>
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="panel-empty">{{ 'security_panel.no_events' | translate }}</p>
      }

      @if (error()) {
        <p class="panel-error" role="alert">{{ 'security_panel.close_error' | translate }}</p>
      }
    }
  `,
})
export class SecurityPanelComponent {
  @Input({ required: true }) data!: SecuritySummary;
  @Input() failed = false;
  /** Dopo la chiusura di una sessione la dashboard ricarica lo snapshot (saltando la cache). */
  @Output() changed = new EventEmitter<void>();

  private readonly api = inject(AdminDashboardService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  readonly busyId = signal<string | null>(null);
  readonly error = signal(false);

  isSelf(session: SecuritySession): boolean {
    return session.userId === this.auth.currentUser()?._id;
  }

  badgeClass(type: SecurityEventType): string {
    return `panel-badge ${EVENT_BADGE[type]}`.trim();
  }

  close(session: SecuritySession): void {
    const message = this.translate.instant('security_panel.close_confirm', { name: session.name }) as string;
    if (!confirm(message)) return;
    this.busyId.set(session.userId);
    this.error.set(false);
    this.api.revokeSession(session.userId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.changed.emit();
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(true);
      },
    });
  }
}
