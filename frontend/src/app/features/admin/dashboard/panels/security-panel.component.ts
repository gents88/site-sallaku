import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { jwtClaims } from '../../../../core/utils/jwt';
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
  imports: [DatePipe, DecimalPipe, MatExpansionModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss', './security-panel.component.scss'],
  templateUrl: './security-panel.component.html',
})
export class SecurityPanelComponent {
  @Input({ required: true }) data!: SecuritySummary;
  @Input() failed = false;
  /** Dopo la chiusura di una sessione la dashboard ricarica lo snapshot (saltando la cache). */
  @Output() changed = new EventEmitter<void>();

  private readonly api = inject(AdminDashboardService);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);

  /** Dopo quanti giorni il backend cancella la cronologia (SECURITY_EVENT_TTL_DAYS lato server). */
  readonly retentionDays = 3;
  readonly busyId = signal<string | null>(null);
  readonly error = signal(false);

  /**
   * Il dispositivo da cui sto lavorando (stesso sid del mio token): per quello c'è il logout. Le altre
   * sessioni, anche del mio stesso account, si possono chiudere. Con un token precedente al
   * multi-dispositivo il sid manca e si ripiega sul vecchio criterio (stesso utente).
   */
  isCurrent(session: SecuritySession): boolean {
    const token = this.auth.getToken();
    const mySid = token ? jwtClaims(token)?.['sid'] : undefined;
    if (typeof mySid === 'string') return session.sessionId === mySid;
    return session.userId === this.auth.currentUser()?._id;
  }

  badgeClass(type: SecurityEventType): string {
    return `panel-badge ${EVENT_BADGE[type]}`.trim();
  }

  close(session: SecuritySession): void {
    const message = this.translate.instant('security_panel.close_confirm', { name: session.name }) as string;
    if (!confirm(message)) return;
    this.busyId.set(session.sessionId);
    this.error.set(false);
    this.api.revokeSession(session.userId, session.sessionId).subscribe({
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
