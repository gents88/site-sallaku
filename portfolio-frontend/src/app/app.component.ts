import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginComponent } from './features/admin/auth/login/login.component';
import { AuthService } from './core/services/auth.service';
import { SeoService } from './core/services/seo.service';
import { AuthModalService } from './core/services/auth-modal.service';
import { InactivityService } from './core/services/inactivity.service';
import { SessionTimeoutModalComponent } from './shared/components/session-timeout-modal/session-timeout-modal.component';
import { ChatbotComponent } from './features/chatbot/chatbot.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule, NavbarComponent, FooterComponent, LoginComponent, SessionTimeoutModalComponent, ChatbotComponent],
  template: `
    <a class="skip-link" href="#hero">{{ 'skip.link' | translate }}</a>
    <div class="wip-banner" role="status">{{ 'banner.wip' | translate }}</div>
    <app-navbar />
    <main>
      <router-outlet />
    </main>
    <app-footer />
    @if (authModal.loginOpen()) {
      @defer (when authModal.loginOpen()) {
        <app-login [embedded]="true" />
      }
    }
    @if (authModal.accountOpen()) {
      <div class="account-modal-backdrop" (click)="closeAccountModal()" aria-hidden="true"></div>
      <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-modal-title" (click)="$event.stopPropagation()">
        <button type="button" class="account-modal__close" (click)="closeAccountModal()" aria-label="Chiudi account">
          ×
        </button>
        <div class="account-modal__hero">
          <div class="account-modal__avatar">{{ auth.currentUser()?.name?.charAt(0) || 'A' }}</div>
          <div class="account-modal__identity">
            <span class="account-modal__badge">Admin</span>
            <h2 id="account-modal-title">{{ auth.currentUser()?.name || 'Admin' }}</h2>
            <p class="account-modal__subtitle">{{ auth.currentUser()?.email }}</p>
          </div>
        </div>
        <div class="account-modal__meta">
          <div class="account-modal__meta-card">
            <span class="account-modal__meta-label">Stato</span>
            <strong>Sessione attiva</strong>
          </div>
          <div class="account-modal__meta-card">
            <span class="account-modal__meta-label">Ruolo</span>
            <strong>Administrator</strong>
          </div>
        </div>
        <div class="account-modal__actions">
          <button type="button" class="account-modal__button account-modal__button--primary" (click)="goToDashboard()">{{ 'nav.dashboard' | translate }}</button>
          <button type="button" class="account-modal__button account-modal__button--warn" (click)="logoutFromModal()">{{ 'admin.logout' | translate }}</button>
          <button type="button" class="account-modal__button account-modal__button--ghost" (click)="closeAccountModal()">{{ 'common.close' | translate }}</button>
        </div>
      </section>
    }
    @if (inactivity.warningVisible()) {
      <app-session-timeout-modal
        [countdownSeconds]="inactivity.countdownSeconds()"
        (stayLoggedIn)="extendSession()"
        (logoutNow)="logoutFromTimeout()" />
    }
    <app-chatbot />
  `,
  styles: [`
    .skip-link {
      position: absolute;
      left: 16px;
      top: -60px;
      z-index: 1201;
      padding: 12px 16px;
      border-radius: 999px;
      background: var(--primary-500, #4f6af5);
      color: #fff;
      font-weight: 700;
      transition: top 0.2s ease;
      text-decoration: none;
    }

    .skip-link:focus {
      top: 16px;
    }

    .wip-banner {
      position: fixed;
      top: 72px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(90deg, #ffd54a, #ffb84d);
      color: #000;
      padding: 6px 12px;
      border-radius: 999px;
      font-weight: 600;
      z-index: 1100;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    }

    main {
      min-height: calc(100vh - 130px);
    }

    .account-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1590;
      background: var(--surface-overlay-strong, rgba(6, 10, 18, 0.58));
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .account-modal {
      position: fixed;
      top: 92px;
      right: 24px;
      z-index: 1600;
      width: min(360px, calc(100vw - 24px));
      padding: 1.1rem;
      border-radius: 26px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background:
        radial-gradient(circle at top right, rgba(79, 106, 245, 0.18), transparent 34%),
        var(--panel-gradient, linear-gradient(180deg, rgba(13, 18, 33, 0.98), rgba(8, 12, 24, 0.98)));
      box-shadow: 0 34px 90px rgba(2, 6, 23, 0.46);
      color: var(--text-primary, #f0f4ff);
      animation: accountModalIn 0.22s ease-out;
      overflow: hidden;
    }

    .account-modal__close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-primary, #f0f4ff);
      font-size: 1.15rem;
      line-height: 1;
      cursor: pointer;
    }

    .account-modal__hero {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.45rem 0.1rem 1rem;
    }

    .account-modal__identity {
      min-width: 0;
    }

    .account-modal__avatar {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 1.2rem;
      font-weight: 800;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(135deg, #4f6af5, #06b6d4 55%, #38bdf8);
      box-shadow: 0 14px 34px rgba(79, 106, 245, 0.28);
    }

    .account-modal__badge {
      display: inline-flex;
      align-items: center;
      margin-bottom: 0.45rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.2);
      color: #7dd3fc;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .account-modal h2 {
      margin: 0;
      font-size: 1.15rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .account-modal__subtitle {
      margin: 0.3rem 0 0;
      color: var(--text-secondary, #8892b0);
      word-break: break-word;
      font-size: 0.9rem;
    }

    .account-modal__meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .account-modal__meta-card {
      padding: 0.85rem 0.9rem;
      border-radius: 18px;
      border: 1px solid rgba(148, 163, 184, 0.14);
      background: var(--panel-surface, rgba(15, 23, 42, 0.34));
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .account-modal__meta-card strong {
      display: block;
      font-size: 0.96rem;
    }

    .account-modal__meta-label {
      display: block;
      margin-bottom: 0.25rem;
      color: var(--text-secondary, #8892b0);
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .account-modal__actions {
      display: grid;
      gap: 0.65rem;
    }

    .account-modal__button {
      min-height: 44px;
      border: 1px solid rgba(99, 102, 241, 0.16);
      border-radius: 16px;
      background: rgba(79, 106, 245, 0.08);
      color: inherit;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }

    .account-modal__button:hover {
      transform: translateY(-1px);
      background: rgba(79, 106, 245, 0.14);
    }

    .account-modal__button--primary {
      background: linear-gradient(135deg, rgba(79, 106, 245, 0.22), rgba(6, 182, 212, 0.14));
      border-color: rgba(79, 106, 245, 0.24);
    }

    .account-modal__button--warn {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.24);
    }

    .account-modal__button--ghost {
      background: transparent;
      border-color: rgba(148, 163, 184, 0.16);
    }

    @keyframes accountModalIn {
      from {
        opacity: 0;
        transform: translate3d(0, -10px, 0) scale(0.98);
      }

      to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }

    @media (max-width: 900px) {
      .wip-banner {
        top: 76px;
        max-width: calc(100vw - 32px);
        text-align: center;
      }

      .account-modal {
        top: 88px;
        right: 12px;
        width: min(360px, calc(100vw - 20px));
      }

      .account-modal__meta {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class AppComponent implements OnInit {
  constructor(
    public authModal: AuthModalService,
    public auth: AuthService,
    public inactivity: InactivityService,
    private seoService: SeoService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.inactivity.init();
    this.seoService.trackPageViews();
  }

  closeAccountModal(): void {
    this.authModal.closeAccount();
  }

  goToDashboard(): void {
    this.authModal.closeAccount();
    void this.router.navigate(['/admin']);
  }

  logoutFromModal(): void {
    this.authModal.closeAll();
    this.auth.logout('/');
  }

  extendSession(): void {
    this.inactivity.stayLoggedIn();
  }

  logoutFromTimeout(): void {
    this.inactivity.logoutNow();
  }
}
