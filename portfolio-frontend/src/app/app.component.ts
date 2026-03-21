import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoginComponent } from './features/admin/auth/login/login.component';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { SeoService } from './core/services/seo.service';
import { LanguageService } from './core/services/language.service';
import { AuthModalService } from './core/services/auth-modal.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule, NavbarComponent, FooterComponent, LoginComponent],
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
        <div class="account-modal__avatar">{{ auth.currentUser()?.name?.charAt(0) || 'A' }}</div>
        <h2 id="account-modal-title">{{ auth.currentUser()?.name || 'Admin' }}</h2>
        <p class="account-modal__subtitle">{{ auth.currentUser()?.email }}</p>
        <div class="account-modal__actions">
          <button type="button" class="account-modal__button" (click)="goToDashboard()">{{ 'nav.dashboard' | translate }}</button>
          <button type="button" class="account-modal__button account-modal__button--warn" (click)="logoutFromModal()">{{ 'admin.logout' | translate }}</button>
          <button type="button" class="account-modal__button account-modal__button--ghost" (click)="closeAccountModal()">{{ 'common.close' | translate }}</button>
        </div>
      </section>
    }
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
      background: rgba(6, 10, 18, 0.58);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .account-modal {
      position: fixed;
      top: 96px;
      right: 28px;
      z-index: 1600;
      width: min(320px, calc(100vw - 24px));
      padding: 1.35rem;
      border-radius: 22px;
      border: 1px solid rgba(99, 102, 241, 0.18);
      background: linear-gradient(180deg, rgba(15, 20, 36, 0.98), rgba(10, 14, 26, 0.98));
      box-shadow: 0 30px 80px rgba(15, 23, 42, 0.4);
      color: var(--text-primary, #f0f4ff);
      animation: accountModalIn 0.22s ease-out;
    }

    .account-modal__avatar {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 0.85rem;
      font-size: 1.05rem;
      font-weight: 800;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(135deg, #4f6af5, #06b6d4);
    }

    .account-modal h2 {
      margin: 0;
      font-size: 1.1rem;
    }

    .account-modal__subtitle {
      margin: 0.35rem 0 1rem;
      color: var(--text-secondary, #8892b0);
      word-break: break-word;
    }

    .account-modal__actions {
      display: grid;
      gap: 0.65rem;
    }

    .account-modal__button {
      min-height: 44px;
      border: 1px solid rgba(99, 102, 241, 0.16);
      border-radius: 14px;
      background: rgba(79, 106, 245, 0.1);
      color: inherit;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
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
      }
    }
  `],
})
export class AppComponent implements OnInit {
  constructor(
    public authModal: AuthModalService,
    public auth: AuthService,
    private themeService: ThemeService,
    private seoService: SeoService,
    private langService: LanguageService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.themeService.init();
    this.seoService.trackPageViews();
    document.documentElement.lang = this.langService.current();
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
}
