import { ChangeDetectionStrategy, AfterViewInit, Component, ElementRef, HostListener, Inject, Input, OnDestroy, OnInit, PLATFORM_ID, ViewChild, computed, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { AuthModalService } from '../../../../core/services/auth-modal.service';
import { SnackbarService } from '../../../../core/services/snackbar.service';
import { AuthErrorView, emailValidator, mapAuthError, normalizePhone, phoneValidator, readLastLoginAdmin, storeLastLoginAdmin } from '../auth-form.utils';

import { ProfilePhotoComponent } from '../../../../shared/components/profile-photo/profile-photo.component';
import { GenericAvatarComponent } from '../../../../shared/components/generic-avatar/generic-avatar.component';

/** Ultima email usata, salvata solo se l'utente spunta "Ricorda la mia email". */
export const LAST_LOGIN_EMAIL_KEY = 'portfolio_last_login_email';
const OTP_EXPIRY_SECONDS = 300; // stessa finestra di 5 minuti del backend
const RESEND_COOLDOWN_SECONDS = 60;
/** Quanto resta visibile la spunta di "accesso effettuato" prima di chiudere/reindirizzare. */
export const SUCCESS_DELAY_MS = 700;

type LoginMode = 'password' | 'code';
type CodeChannel = 'email' | 'sms';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [ProfilePhotoComponent, GenericAvatarComponent, CommonModule, ReactiveFormsModule, RouterLink, MatIconModule, TranslateModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() embedded = false;
  @ViewChild('card') private cardRef?: ElementRef<HTMLElement>;

  form = this.fb.nonNullable.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    remember: [false],
  });

  /** Un campo per canale: passando da Email a Cellulare e ritorno, ciò che era scritto resta. */
  codeForm = this.fb.nonNullable.group({
    email: ['', [emailValidator]],
    phone: ['', [phoneValidator]],
  });

  readonly mode = signal<LoginMode>('password');
  readonly codeStep = signal<'identifier' | 'verify'>('identifier');
  readonly codeChannel = signal<CodeChannel>('email');
  /** Il cellulare compare solo se il backend può davvero mandare l'SMS (provider configurato). */
  readonly smsAvailable = signal(false);
  /** Arrivati al codice da "Password dimenticata?": cambia solo il testo d'aiuto. */
  readonly forgotFlow = signal(false);
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly error = signal<AuthErrorView | null>(null);
  readonly showPassword = signal(false);
  readonly capsLock = signal(false);

  readonly codeTarget = signal('');
  readonly otpValue = signal('');
  readonly otpFocused = signal(false);
  readonly countdown = signal(0);
  readonly resendIn = signal(0);

  readonly otpSlots = [0, 1, 2, 3, 4, 5];
  readonly codeByEmail = computed(() => this.codeTarget().includes('@'));
  readonly codeExpired = computed(() => this.codeStep() === 'verify' && this.countdown() <= 0);
  readonly activeSlot = computed(() => Math.min(this.otpValue().length, 5));
  readonly countdownLabel = computed(() => {
    const s = Math.max(this.countdown(), 0);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  });
  readonly userName = computed(() => this.auth.currentUser()?.name?.split(' ')[0] ?? '');
  /** Ultimo accesso riuscito su questo dispositivo fatto dall'admin. */
  private readonly lastLoginAdmin = readLastLoginAdmin();

  private readonly isBrowser: boolean;
  private finishTimeoutId: number | null = null;
  private countdownId: number | null = null;
  private resendId: number | null = null;
  private returnFocusTo: HTMLElement | null = null;
  private previousBodyOverflow: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private authModal: AuthModalService,
    private router: Router,
    private host: ElementRef<HTMLElement>,
    private snackbar: SnackbarService,
    private translate: TranslateService,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      if (this.auth.isAdmin()) {
        this.scheduleFinish(80);
        return;
      }
      // Already logged in as a plain 'user' account: nothing to reject anymore,
      // just get out of the way of whatever triggered the login UI.
      if (this.embedded) {
        this.authModal.closeLogin();
      } else {
        this.router.navigate(['/']);
      }
      return;
    }

    const remembered = this.readRememberedEmail();
    if (remembered) {
      this.form.patchValue({ email: remembered, remember: true });
    }

    if (this.isBrowser) {
      this.auth.getOtpChannels().subscribe({
        next: (channels) => this.smsAvailable.set(channels.sms),
        error: () => { /* senza risposta resta solo l'email, che funziona sempre */ },
      });
    }

    if (this.embedded && this.isBrowser) {
      // Chi ha aperto il modale riprende il focus alla chiusura, e la pagina
      // sotto non scorre mentre si interagisce con la card (su mobile il
      // gesto dentro la card trascinava la pagina dietro).
      this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  }

  ngAfterViewInit(): void {
    // Solo se il form resta davvero visibile — ngOnInit reindirizza/chiude subito
    // chi è già loggato, e mettere a fuoco un campo in procinto di sparire non serve.
    if (!this.auth.isLoggedIn()) {
      // Email già ricordata: si parte direttamente dalla password.
      setTimeout(() => this.focusField(this.form.controls.email.value ? '#auth-password' : '#auth-email'), 0);
    }
  }

  ngOnDestroy(): void {
    if (this.finishTimeoutId !== null && this.embedded) {
      // Chiuso dall'esterno prima della fine della conferma: InactivityService
      // chiude il login appena esiste una sessione. Il redirect dell'admin
      // parte comunque (prima veniva perso col timer), e la conferma che la
      // card non ha fatto in tempo a mostrare diventa un toast.
      this.clearTimer('finishTimeoutId');
      if (this.success()) this.toastSuccess();
      this.finish();
    }
    this.clearTimer('finishTimeoutId');
    this.clearTimer('countdownId');
    this.clearTimer('resendId');
    if (this.previousBodyOverflow !== null) {
      document.body.style.overflow = this.previousBodyOverflow;
    }
    if (this.returnFocusTo?.isConnected) {
      this.returnFocusTo.focus({ preventScroll: true });
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closeModal();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro la card finché è aperta come dialog. */
  onModalTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const card = ke.currentTarget as HTMLElement;
    const focusable = Array.from(
      card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }

  closeModal(): void {
    if (this.loading() || this.success()) {
      return;
    }

    if (this.embedded) {
      this.authModal.closeLogin();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    this.router.navigate(['/']);
  }

  /**
   * Link che portano fuori dal modale (es. registrazione): la navigazione
   * parte comunque dal routerLink, ma senza chiudere il modale embedded
   * questo restava aperto sopra la pagina di destinazione.
   */
  leaveModal(): void {
    if (this.embedded) this.authModal.closeLogin();
  }

  /**
   * La foto di Gent solo dove ad accedere è lui: la pagina admin
   * (/dashboard/login) e il modale su un dispositivo dove l'ultimo accesso è
   * stato suo. Per tutti gli altri profili un avatar generico; ad accesso
   * avvenuto decide il ruolo reale.
   */
  showAdminPhoto(): boolean {
    if (this.success()) return this.auth.isAdmin();
    return !this.embedded || this.lastLoginAdmin;
  }

  // ── Modalità (password / codice) ────────────────────────────────────────────

  setMode(mode: LoginMode): void {
    if (this.loading() || this.mode() === mode) return;
    this.mode.set(mode);
    this.error.set(null);
    if (mode === 'code') {
      this.prefillIdentifierFromEmail();
      setTimeout(() => this.focusField(this.codeStep() === 'verify' ? '.otp__input' : '#auth-identifier'), 0);
    } else {
      this.forgotFlow.set(false);
      setTimeout(() => this.focusField(this.form.controls.email.value ? '#auth-password' : '#auth-email'), 0);
    }
  }

  /** Frecce sinistra/destra sul tablist, come da pattern ARIA tabs. */
  onTabsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: LoginMode = this.mode() === 'password' ? 'code' : 'password';
    this.setMode(next);
    setTimeout(() => this.focusField(`#auth-tab-${next}`), 0);
  }

  /** Non c'è un reset password: si accede con un codice via email, che non richiede la password. */
  forgotPassword(): void {
    this.forgotFlow.set(true);
    // L'account con password è legato all'email: col cellulare se ne aprirebbe un altro.
    this.codeChannel.set('email');
    this.setMode('code');
  }

  // ── Login con password ──────────────────────────────────────────────────────

  showError(control: 'email' | 'password'): boolean {
    const c = this.form.controls[control];
    return c.invalid && c.touched;
  }

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  onPasswordKey(event: KeyboardEvent): void {
    if (typeof event.getModifierState === 'function') {
      this.capsLock.set(event.getModifierState('CapsLock'));
    }
  }

  login(): void {
    if (this.loading()) return;
    this.error.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusField(this.form.controls.email.invalid ? '#auth-email' : '#auth-password');
      return;
    }

    const { email, password, remember } = this.form.getRawValue();
    this.loading.set(true);
    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => {
        this.storeRememberedEmail(remember ? email.trim() : null);
        this.onAuthenticated();
      },
      error: (err) => this.fail(err, 'auth.login_error'),
    });
  }

  /** Email non ancora confermata: il codice via email la conferma e fa accedere in un colpo solo. */
  sendVerificationCode(): void {
    const email = this.form.controls.email.value.trim();
    if (!email || this.loading()) return;
    this.codeForm.controls.email.setValue(email);
    this.codeChannel.set('email');
    this.mode.set('code');
    this.sendCode(email);
  }

  // ── Login con codice ────────────────────────────────────────────────────────

  /** Il campo del canale scelto: un solo input nel template, legato a email o telefono. */
  get codeControl() {
    return this.codeChannel() === 'sms' ? this.codeForm.controls.phone : this.codeForm.controls.email;
  }

  setChannel(channel: CodeChannel): void {
    if (this.loading() || this.codeChannel() === channel) return;
    this.codeChannel.set(channel);
    this.error.set(null);
    setTimeout(() => this.focusField('#auth-identifier'), 0);
  }

  showIdentifierError(): boolean {
    const c = this.codeControl;
    return c.invalid && c.touched;
  }

  requestCode(): void {
    if (this.loading()) return;
    this.error.set(null);
    const ctrl = this.codeControl;
    if (ctrl.invalid) {
      ctrl.markAsTouched();
      this.focusField('#auth-identifier');
      return;
    }
    // "333 123 4567" → "+393331234567": il backend accetta solo E.164.
    this.sendCode(this.codeChannel() === 'sms' ? normalizePhone(ctrl.value)! : ctrl.value.trim());
  }

  resendCode(): void {
    if (this.resendIn() > 0 || this.loading()) return;
    this.sendCode(this.codeTarget());
  }

  changeIdentifier(): void {
    if (this.loading()) return;
    this.clearTimer('countdownId');
    this.clearTimer('resendId');
    this.codeStep.set('identifier');
    this.otpValue.set('');
    this.error.set(null);
    setTimeout(() => this.focusField('#auth-identifier'), 0);
  }

  focusOtp(): void {
    this.focusField('.otp__input');
  }

  onOtpInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Non si disabilita il campo durante la verifica (perderebbe il focus e le
    // cifre digitate subito dopo un errore): si ignora solo l'input intanto.
    if (this.loading()) {
      input.value = this.otpValue();
      return;
    }
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value !== digits) input.value = digits;
    this.otpValue.set(digits);
    if (this.error()) this.error.set(null);
    // Incolla / autofill SMS: con 6 cifre si verifica subito, niente click in più.
    if (digits.length === 6) this.verifyCode();
  }

  verifyCode(): void {
    if (this.loading() || this.codeExpired()) return;
    const otp = this.otpValue();
    if (!/^\d{6}$/.test(otp)) {
      this.error.set({ key: 'auth.otp_required' });
      this.focusOtp();
      return;
    }

    this.error.set(null);
    this.loading.set(true);
    this.auth.verifyOtp(this.codeTarget(), otp).subscribe({
      next: () => this.onAuthenticated(),
      error: (err) => {
        this.fail(err, 'auth.otp_invalid');
        this.otpValue.set('');
        setTimeout(() => this.focusOtp(), 0);
      },
    });
  }

  private sendCode(identifier: string): void {
    this.error.set(null);
    this.loading.set(true);
    this.auth.requestOtp(identifier).subscribe({
      next: () => {
        this.loading.set(false);
        this.codeTarget.set(identifier);
        this.otpValue.set('');
        this.codeStep.set('verify');
        this.startCountdown();
        this.startResendCooldown();
        // Il campo del codice esiste solo dopo che l'@if dello step lo renderizza.
        setTimeout(() => this.focusOtp(), 0);
      },
      error: (err) => this.fail(err, 'auth.otp_send_failed'),
    });
  }

  private startCountdown(): void {
    this.clearTimer('countdownId');
    this.countdown.set(OTP_EXPIRY_SECONDS);
    this.countdownId = window.setInterval(() => {
      this.countdown.update(s => s - 1);
      if (this.countdown() <= 0) this.clearTimer('countdownId');
    }, 1000);
  }

  private startResendCooldown(): void {
    this.clearTimer('resendId');
    this.resendIn.set(RESEND_COOLDOWN_SECONDS);
    this.resendId = window.setInterval(() => {
      this.resendIn.update(s => s - 1);
      if (this.resendIn() <= 0) this.clearTimer('resendId');
    }, 1000);
  }

  // ── Esito ───────────────────────────────────────────────────────────────────

  private onAuthenticated(): void {
    storeLastLoginAdmin(this.auth.isAdmin());
    this.loading.set(false);
    this.success.set(true);
    this.clearTimer('countdownId');
    this.clearTimer('resendId');
    this.scheduleFinish(SUCCESS_DELAY_MS);
  }

  private fail(err: unknown, fallbackKey: string): void {
    this.loading.set(false);
    this.error.set(mapAuthError(err, fallbackKey));
    this.shakeCard();
  }

  private scheduleFinish(delay: number): void {
    this.clearTimer('finishTimeoutId');
    this.finishTimeoutId = window.setTimeout(() => {
      this.finishTimeoutId = null;
      this.finish();
    }, delay);
  }

  private finish(): void {
    if (this.auth.isAdmin()) {
      this.authModal.closeLogin();
      this.authModal.closeAccount();
      this.router.navigate(['/dashboard']);
    } else if (this.embedded) {
      // Opened from a public /lab tool to unlock saving results — just
      // close the modal, the caller re-checks auth state on its own.
      this.authModal.closeLogin();
    } else {
      // A plain 'user' account has nothing to do in /dashboard.
      this.router.navigate(['/']);
    }
  }

  private toastSuccess(): void {
    const name = this.userName();
    const title = this.translate.instant('auth.success_title');
    const message = name ? `${title} · ${this.translate.instant('auth.success_hello', { name })}` : title;
    this.snackbar.show(message, 'success', 3000);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private prefillIdentifierFromEmail(): void {
    const id = this.codeForm.controls.email;
    const email = this.form.controls.email;
    if (!id.value && email.valid) id.setValue(email.value.trim());
  }

  private shakeCard(): void {
    const card = this.cardRef?.nativeElement;
    if (!card || typeof card.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    card.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 380, easing: 'ease-in-out' },
    );
  }

  private focusField(selector: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }

  private readRememberedEmail(): string {
    if (!this.isBrowser) return '';
    try {
      return localStorage.getItem(LAST_LOGIN_EMAIL_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private storeRememberedEmail(email: string | null): void {
    if (!this.isBrowser) return;
    try {
      if (email) localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email);
      else localStorage.removeItem(LAST_LOGIN_EMAIL_KEY);
    } catch { /* storage bloccato: si rinuncia solo al promemoria */ }
  }

  private clearTimer(key: 'finishTimeoutId' | 'countdownId' | 'resendId'): void {
    const id = this[key];
    if (id !== null) {
      window.clearTimeout(id);
      window.clearInterval(id);
      this[key] = null;
    }
  }
}
