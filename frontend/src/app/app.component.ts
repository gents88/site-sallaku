import { ApplicationRef, ChangeDetectionStrategy, Component, HostListener, OnInit, effect, signal, untracked, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { ConsentBannerComponent } from './shared/components/consent-banner/consent-banner.component';
import { LoginComponent } from './features/admin/auth/login/login.component';
import { AuthService } from './core/services/auth.service';
import { SeoService } from './core/services/seo.service';
import { AnalyticsTrackingService } from './core/services/analytics-tracking.service';
import { AuthModalService } from './core/services/auth-modal.service';
import { InactivityService } from './core/services/inactivity.service';
import { PlatformUiService } from './core/services/platform-ui.service';
import { AppUpdateService } from './core/services/app-update.service';
import { AdminNotificationsService } from './core/services/admin-notifications.service';
import { OnboardingTourService } from './core/onboarding/onboarding-tour.service';
import { SessionTimeoutModalComponent } from './shared/components/session-timeout-modal/session-timeout-modal.component';
import { ChatbotComponent } from './features/chatbot/chatbot.component';
import { SearchOverlayComponent } from './shared/components/search-overlay/search-overlay.component';
import { OfflineBannerComponent } from './shared/components/offline-banner/offline-banner.component';
import { InstallPromptComponent } from './shared/components/install-prompt/install-prompt.component';
import { InstallPromptService } from './core/services/install-prompt.service';
import { LabActivityService } from './core/services/lab-activity.service';
import { LabNextStepsComponent } from './shared/components/lab-next-steps/lab-next-steps.component';
import { MaintenanceOverlayComponent } from './shared/components/maintenance-overlay/maintenance-overlay.component';
import { FeatureFlagsService } from './core/services/feature-flags.service';

import { initGlassSpotlight } from './core/utils/glass-spotlight';
import { documentLoaded, endBootPhaseWhenReady } from './core/utils/boot-phase';
import { ProfilePhotoComponent } from './shared/components/profile-photo/profile-photo.component';
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterOutlet, TranslateModule, NavbarComponent, FooterComponent, SidebarComponent, LoginComponent, SessionTimeoutModalComponent, ChatbotComponent, ConsentBannerComponent, SearchOverlayComponent, OfflineBannerComponent, InstallPromptComponent, LabNextStepsComponent, ProfilePhotoComponent, MaintenanceOverlayComponent],
  template: `
    <a class="skip-link" href="#main-content">{{ 'skip.link' | translate }}</a>
    <div class="ambient-bg" aria-hidden="true"><i></i><i></i><i></i></div>
    <app-navbar />
    <app-consent-banner />
    <app-sidebar />
    <app-search-overlay />
    <app-offline-banner />
    <app-install-prompt />
    <app-lab-next-steps />
    <app-maintenance-overlay />
    <main id="main-content" tabindex="-1">
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
      <section
        class="account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        tabindex="-1"
        (click)="$event.stopPropagation()"
        (keydown.tab)="onAccountModalTabKey($event)"
      >
        <span class="account-modal__grabber" aria-hidden="true"></span>
        <div class="account-modal__cover" aria-hidden="true"></div>
        <button type="button" class="account-modal__close" (click)="closeAccountModal()" [attr.aria-label]="'common.close' | translate">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
        <div class="account-modal__body">
          <div class="account-modal__avatar-wrap">
            @if (auth.isAdmin()) {
              <div class="account-modal__avatar account-modal__avatar--photo"><app-profile-photo /></div>
            } @else {
              <div class="account-modal__avatar">{{ auth.currentUser()?.name?.charAt(0) || 'A' }}</div>
            }
            <span class="account-modal__presence" aria-hidden="true"></span>
          </div>
          <div class="account-modal__identity">
            <h2 id="account-modal-title">{{ auth.currentUser()?.name || 'Admin' }}</h2>
            <p class="account-modal__subtitle" [attr.title]="auth.currentUser()?.email">{{ auth.currentUser()?.email }}</p>
          </div>
          <ul class="account-modal__chips">
            <li class="account-modal__chip account-modal__chip--status">
              <span class="account-modal__dot" aria-hidden="true"></span>
              <span class="account-modal__chip-label">{{ 'account_modal.status_label' | translate }}:</span>
              {{ 'account_modal.status_active' | translate }}
            </li>
            <li class="account-modal__chip" [class.account-modal__chip--admin]="auth.isAdmin()">
              <span class="account-modal__chip-label">{{ 'account_modal.role_label' | translate }}:</span>
              {{ (auth.isAdmin() ? 'account_modal.role_admin' : 'account_modal.role_user') | translate }}
            </li>
          </ul>
          <div class="account-modal__actions">
            @if (auth.isAdmin()) {
              <button type="button" class="account-modal__button account-modal__button--primary" (click)="goToDashboard()">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/></svg>
                {{ 'nav.dashboard' | translate }}
              </button>
            } @else {
              <button type="button" class="account-modal__button account-modal__button--primary" (click)="goToMyFiles()">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>
                {{ 'sidebar.items.my_files' | translate }}
              </button>
            }
            <button type="button" class="account-modal__button account-modal__button--warn" (click)="logoutFromModal()">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H9"/><path d="M15 8l4 4-4 4M19 12H9.5"/></svg>
              {{ 'admin.logout' | translate }}
            </button>
          </div>
        </div>
      </section>
    }
    @if (inactivity.warningVisible()) {
      <app-session-timeout-modal
        [countdownSeconds]="inactivity.countdownSeconds()"
        [admin]="inactivity.isAdminSession()"
        (stayLoggedIn)="extendSession()"
        (logoutNow)="logoutFromTimeout()" />
    }
    @if (featureFlags.chatbotEnabled()) {
      @defer (on idle) {
        <app-chatbot />
      }
    }
    @if (showBackToTop()) {
      <button class="back-to-top" (click)="scrollToTop()" [attr.aria-label]="'nav.back_to_top' | translate">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      </button>
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
      animation: accountFade 0.2s ease-out;
    }

    /* Scheda dell'account: su schermi larghi un pannello ancorato in alto a destra,
       su telefono un "bottom sheet" a tutta larghezza (qualunque sistema operativo). */
    .account-modal {
      position: fixed;
      top: 84px;
      right: 24px;
      z-index: 1600;
      box-sizing: border-box;
      width: min(380px, calc(100vw - 24px));
      max-height: calc(100dvh - 104px);
      overflow: hidden auto;
      border-radius: 28px;
      border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.18));
      background: var(--panel-gradient, linear-gradient(180deg, rgba(13, 18, 33, 0.98), rgba(8, 12, 24, 0.98)));
      box-shadow: 0 30px 80px rgba(2, 6, 23, 0.45);
      color: var(--text-primary, #f0f4ff);
      animation: accountModalIn 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
      --account-ring: #0d1221;
    }

    .account-modal:focus { outline: none; }

    .account-modal__grabber { display: none; }

    .account-modal__cover {
      height: 88px;
      background:
        radial-gradient(circle at 85% 0%, rgba(34, 211, 238, 0.55), transparent 55%),
        radial-gradient(circle at 10% 100%, rgba(139, 92, 246, 0.55), transparent 55%),
        linear-gradient(135deg, #3b4fd0, #0e7490);
    }

    .account-modal__close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 50%;
      background: rgba(2, 6, 23, 0.35);
      color: #fff;
      cursor: pointer;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .account-modal__close:hover { background: rgba(2, 6, 23, 0.55); transform: scale(1.06); }

    .account-modal__body {
      display: grid;
      gap: 0.9rem;
      padding: 0 1.4rem 1.4rem;
    }

    .account-modal__avatar-wrap {
      position: relative;
      width: 84px;
      height: 84px;
      margin-top: -42px;
    }

    .account-modal__avatar {
      box-sizing: border-box;
      width: 84px;
      height: 84px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: 800;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(135deg, #3b4fd0, #0e7490 55%, #0369a1);
      border: 4px solid var(--account-ring);
      box-shadow: 0 14px 34px rgba(79, 106, 245, 0.3);
    }

    .account-modal__avatar--photo { padding: 0; overflow: hidden; }

    .account-modal__presence {
      position: absolute;
      right: 4px;
      bottom: 6px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #22c55e;
      border: 3px solid var(--account-ring);
    }

    .account-modal__identity { min-width: 0; }

    .account-modal h2 {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .account-modal__subtitle {
      margin: 0.25rem 0 0;
      color: var(--text-secondary, #8892b0);
      font-size: 0.92rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .account-modal__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .account-modal__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.2));
      background: color-mix(in srgb, var(--text-primary, #f0f4ff) 6%, transparent);
      font-size: 0.82rem;
      font-weight: 650;
    }

    .account-modal__chip-label { color: var(--text-secondary, #8892b0); font-weight: 500; }
    .account-modal__chip--admin { border-color: rgba(56, 189, 248, 0.4); background: rgba(56, 189, 248, 0.12); }
    .account-modal__dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2); }

    .account-modal__actions {
      display: grid;
      gap: 0.6rem;
      margin-top: 0.2rem;
    }

    .account-modal__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      min-height: 50px;
      border: 1px solid transparent;
      border-radius: 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
    }

    .account-modal__button:hover { transform: translateY(-1px); }
    .account-modal__button:active { transform: translateY(0) scale(0.99); }

    .account-modal__button--primary {
      color: #fff;
      background: linear-gradient(135deg, #3b4fd0, #0e7490);
      box-shadow: 0 10px 26px rgba(59, 79, 208, 0.35);
    }

    .account-modal__button--primary:hover { box-shadow: 0 14px 32px rgba(59, 79, 208, 0.5); }

    .account-modal__button--warn {
      color: var(--c-red-soft, #f87171);
      background: transparent;
      border-color: rgba(239, 68, 68, 0.35);
    }

    .account-modal__button--warn:hover { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.6); }

    :host-context(html[data-theme='light']) .account-modal { --account-ring: #fff; box-shadow: 0 30px 70px rgba(30, 41, 59, 0.22); }
    :host-context(html[data-theme='light']) .account-modal__button--warn { color: #b91c1c; }
    :host-context(html[data-theme='light']) .account-modal__chip--admin { color: #075985; }

    @keyframes accountFade { from { opacity: 0; } to { opacity: 1; } }

    @keyframes accountModalIn {
      from { opacity: 0; transform: translate3d(0, -10px, 0) scale(0.98); }
      to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }

    @keyframes accountSheetIn {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @media (max-width: 900px) {
      .account-modal { top: 76px; right: 12px; max-height: calc(100dvh - 96px); }
    }

    /* Telefono: bottom sheet a tutta larghezza, con maniglia e margine per la barra gesti. */
    @media (max-width: 640px) {
      .account-modal {
        top: auto;
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        max-height: 92dvh;
        border-radius: 28px 28px 0 0;
        border-bottom: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        animation: accountSheetIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        /* Sopra la barra a tab in basso (10050) e i toast (9999): il foglio è un modale, non deve restare
           coperto né farsi intercettare i tocchi da una notifica in background. */
        z-index: 10070;
      }

      .account-modal-backdrop { z-index: 10060; }

      .account-modal__grabber {
        display: block;
        position: absolute;
        top: 8px;
        left: 50%;
        z-index: 1;
        width: 40px;
        height: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.7);
        transform: translateX(-50%);
      }

      .account-modal__cover { height: 96px; }
      .account-modal__body { padding: 0 1.25rem 1.25rem; }
      .account-modal__button { min-height: 54px; font-size: 1.02rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      .account-modal, .account-modal-backdrop { animation: none; }
      .account-modal__button, .account-modal__close { transition: none; }
    }

    /* iOS: materiale "vetro smerigliato" al posto del fondo pieno. */
    :host-context(html[data-os='ios']) .account-modal-backdrop {
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
    }

    .back-to-top {
      position: fixed;
      /* Stacked above il fab della chat (58px + margine) per non finirci
         sovrapposto: stessa ancora right, quota diversa. */
      bottom: 100px;
      right: 28px;
      z-index: 1200;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid rgba(79, 106, 245, 0.3);
      background: linear-gradient(135deg, rgba(79, 106, 245, 0.9), rgba(139, 92, 246, 0.9));
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(79, 106, 245, 0.35);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      animation: bttFadeIn 0.25s ease-out;
      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 28px rgba(79, 106, 245, 0.5);
      }
    }

    /* Sotto i 900px la navbar aggiunge una bottom tab bar fissa (vedi
       navbar.component.scss): senza questo offset il pulsante finirebbe
       parzialmente coperto/nascosto sotto di essa, come già successo per
       drawer e modale login. */
    @media (max-width: 900px) {
      .back-to-top { bottom: calc(100px + var(--bottom-tabbar-height, 60px) + env(safe-area-inset-bottom, 0px)); }
    }
    @media (max-width: 480px) {
      .back-to-top { bottom: calc(90px + var(--bottom-tabbar-height, 60px) + env(safe-area-inset-bottom, 0px)); right: 18px; }
    }

    @keyframes bttFadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }  `],
})
export class AppComponent implements OnInit {
  readonly showBackToTop = signal(false);

  @HostListener('window:scroll')
  onScroll(): void {
    this.showBackToTop.set(window.scrollY > 300);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.authModal.accountOpen()) this.closeAccountModal();
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  constructor(
    public authModal: AuthModalService,
    public auth: AuthService,
    public inactivity: InactivityService,
    private platformUi: PlatformUiService,
    private appUpdate: AppUpdateService,
    private installPrompt: InstallPromptService,
    private labActivity: LabActivityService,
    private adminNotifications: AdminNotificationsService,
    private onboardingTour: OnboardingTourService,
    private seoService: SeoService,
    private analyticsTracking: AnalyticsTrackingService,
    private router: Router,
    private translate: TranslateService,
    public featureFlags: FeatureFlagsService,
    private appRef: ApplicationRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    // Focus della scheda account: dentro all'apertura, di nuovo sul pulsante che l'ha aperta alla chiusura.
    effect(() => {
      const open = this.authModal.accountOpen();
      if (isPlatformBrowser(this.platformId)) untracked(() => this.onAccountModalToggle(open));
    });
  }

  private accountWasOpen = false;
  private accountTrigger: HTMLElement | null = null;

  /**
   * Prima il focus restava sul pulsante dietro la scheda: Tab scorreva la pagina sotto il fondo scuro e, alla
   * chiusura, il focus finiva a caso. All'apertura il focus va sulla scheda (poi Tab scorre i suoi pulsanti,
   * e il trap lo tiene dentro); alla chiusura torna a chi l'aveva aperta.
   */
  private onAccountModalToggle(open: boolean): void {
    if (open && !this.accountWasOpen) {
      const active = document.activeElement as HTMLElement | null;
      this.accountTrigger = active && active !== document.body ? active : null;
      // La scheda entra nel DOM dopo questo ciclo di rilevamento.
      setTimeout(() => document.querySelector<HTMLElement>('.account-modal')?.focus());
    } else if (!open && this.accountWasOpen) {
      const savedTrigger = this.accountTrigger;
      this.accountTrigger = null;
      // Dopo il ciclo di rilevamento: a quel punto la scheda è uscita dal DOM e il focus è tornato sul body.
      setTimeout(() => {
        const trigger = savedTrigger?.isConnected ? savedTrigger : document.querySelector<HTMLElement>('.nav-link--account');
        const active = document.activeElement;
        // Se nel frattempo il focus è andato altrove di proposito (es. dopo un cambio pagina) non lo si ruba.
        if (!active || active === document.body) trigger?.focus();
      });
    }
    this.accountWasOpen = open;
  }

  ngOnInit(): void {
    // Activity tracking binds to `window`, which doesn't exist during SSR/prerender.
    if (isPlatformBrowser(this.platformId)) {
      this.inactivity.init();
      this.platformUi.init();
      this.appUpdate.init();
      this.installPrompt.init();
      this.labActivity.init();
      this.adminNotifications.init();
      this.onboardingTour.scheduleAutoStart();
      initGlassSpotlight(document);
      // Transizioni CSS spente da index.html fino a fine avvio: app stabile
      // (hydration e prima navigazione concluse) e pagina caricata.
      void endBootPhaseWhenReady(document, [this.appRef.whenStable(), documentLoaded(document)]);
    }
    this.seoService.trackPageViews();
    this.analyticsTracking.init();
  }

  ngAfterViewInit(): void {
    try {
      const keys = ['desc','accept_all','reject_all','manage_preferences','necessary','analytics','marketing','preferences','save','settings_title','settings_desc'];
      const i18nObj: Record<string,string> = {};
      keys.forEach(k => {
        const val = this.translate.instant(`consent.${k}`);
        i18nObj[k] = val || '';
      });
      (window as any).__CONSENT_I18N__ = i18nObj;
    } catch (e) { /* ignore */ }
  }

  closeAccountModal(): void {
    this.authModal.closeAccount();
  }

  goToDashboard(): void {
    this.authModal.closeAccount();
    void this.router.navigate(['/dashboard']);
  }

  goToMyFiles(): void {
    this.authModal.closeAccount();
    void this.router.navigate(['/lab/i-miei-file']);
  }

  /** Focus trap manuale sulla modale account: Tab/Shift+Tab restano dentro finché è aperta. */
  onAccountModalTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const modal = ke.currentTarget as HTMLElement;
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // Con il focus sulla scheda stessa (così si apre) Maiusc+Tab porta all'ultimo pulsante, non fuori.
    if (ke.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
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
