import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { NEVER, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_LOGIN_EMAIL_KEY, LoginComponent, SUCCESS_DELAY_MS } from './login.component';
import { AuthService } from '../../../../core/services/auth.service';
import { LAST_LOGIN_ADMIN_KEY } from '../auth-form.utils';
import { AuthModalService } from '../../../../core/services/auth-modal.service';
import { SnackbarService } from '../../../../core/services/snackbar.service';

describe('LoginComponent', () => {
  let auth: {
    isLoggedIn: ReturnType<typeof vi.fn>;
    isAdmin: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof signal<{ name: string } | null>>;
    login: ReturnType<typeof vi.fn>;
    requestOtp: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
    getOtpChannels: ReturnType<typeof vi.fn>;
  };
  let authModal: { closeLogin: ReturnType<typeof vi.fn>; closeAccount: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    document.body.style.overflow = '';
    auth = {
      isLoggedIn: vi.fn(() => false),
      isAdmin: vi.fn(() => false),
      currentUser: signal<{ name: string } | null>(null),
      login: vi.fn(() => of({})),
      requestOtp: vi.fn(() => of({ message: 'ok' })),
      verifyOtp: vi.fn(() => of({})),
      getOtpChannels: vi.fn(() => of({ email: true, sms: true })),
    };
    authModal = { closeLogin: vi.fn(), closeAccount: vi.fn() };
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    document.body.style.overflow = '';
  });

  function setup(embedded = true) {
    TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: auth },
        { provide: AuthModalService, useValue: authModal },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentRef.setInput('embedded', embedded);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) => el.querySelector<T>(sel);
    const type = (sel: string, value: string) => {
      const input = $<HTMLInputElement>(sel)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const submit = () => {
      $<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
    };
    return { fixture, el, $, type, submit, cmp: fixture.componentInstance };
  }

  const expectPhoto = (avatar: HTMLElement | null) => {
    expect(avatar?.textContent?.trim()).toBe('');
    expect(avatar?.querySelector('img')?.getAttribute('src')).toBe('assets/profil-440.jpg');
    const sources = Array.from(avatar?.querySelectorAll('source') ?? []).map(s => s.getAttribute('type'));
    expect(sources).toEqual(['image/avif', 'image/webp']);
  };
  const expectGenericAvatar = (avatar: HTMLElement | null) => {
    expect(avatar?.querySelector('app-generic-avatar svg')).not.toBeNull();
    expect(avatar?.querySelector('img')).toBeNull();
  };

  it('modale: per gli altri profili un avatar generico, non la foto di Gent', () => {
    expectGenericAvatar(setup().$('.auth-avatar'));
  });

  it('pagina admin /dashboard/login: resta la foto profilo', () => {
    expectPhoto(setup(false).$('.auth-avatar'));
  });

  it('modale su un dispositivo dove l\'ultimo accesso è stato dell\'admin: la foto profilo', () => {
    localStorage.setItem(LAST_LOGIN_ADMIN_KEY, '1');
    expectPhoto(setup().$('.auth-avatar'));
  });

  it('accesso admin riuscito: mostra la foto e la ricorda per la prossima apertura', () => {
    vi.useFakeTimers();
    const { $, type, submit } = setup();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.login.mockImplementation(() => {
      auth.isAdmin.mockReturnValue(true);
      return of({});
    });
    type('#auth-email', 'admin@example.com');
    type('#auth-password', 'segreta123');
    submit();
    expectPhoto($('.auth-avatar'));
    expect(localStorage.getItem(LAST_LOGIN_ADMIN_KEY)).toBe('1');
  });

  it('accesso di un altro profilo: resta l\'avatar generico e la foto non viene più ricordata', () => {
    vi.useFakeTimers();
    localStorage.setItem(LAST_LOGIN_ADMIN_KEY, '1');
    const { $, type, submit } = setup();
    type('#auth-email', 'mario@example.com');
    type('#auth-password', 'segreta123');
    submit();
    expectGenericAvatar($('.auth-avatar'));
    expect(localStorage.getItem(LAST_LOGIN_ADMIN_KEY)).toBeNull();
  });

  it('form non valido: niente chiamata al backend, errori sotto i campi', () => {
    const { $, submit } = setup();
    submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect($('#auth-email-error')).not.toBeNull();
    expect($('#auth-password-error')).not.toBeNull();
    expect($('#auth-email')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('login riuscito: mostra la conferma e poi chiude il modale', () => {
    vi.useFakeTimers();
    auth.currentUser.set({ name: 'Mario Rossi' });
    const { $, type, submit, fixture } = setup();
    type('#auth-email', '  mario@example.com ');
    type('#auth-password', 'segreta123');
    submit();

    expect(auth.login).toHaveBeenCalledWith({ email: 'mario@example.com', password: 'segreta123' });
    expect($('.auth-success')).not.toBeNull();
    expect($('.auth-success__text')!.textContent).toContain('auth.success_hello');
    expect(authModal.closeLogin).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SUCCESS_DELAY_MS);
    fixture.detectChanges();
    expect(authModal.closeLogin).toHaveBeenCalled();
  });

  it('admin: dopo il login va al dashboard', () => {
    vi.useFakeTimers();
    const { type, submit, fixture } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.login.mockImplementation(() => {
      auth.isAdmin.mockReturnValue(true);
      return of({});
    });
    type('#auth-email', 'admin@example.com');
    type('#auth-password', 'segreta123');
    submit();
    vi.advanceTimersByTime(SUCCESS_DELAY_MS);
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('chiuso dall\'esterno durante la conferma: l\'admin va comunque al dashboard e la conferma diventa un toast', () => {
    vi.useFakeTimers();
    auth.currentUser.set({ name: 'Gent Sallaku' });
    const { type, submit, fixture } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const toast = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
    auth.login.mockImplementation(() => {
      auth.isAdmin.mockReturnValue(true);
      return of({});
    });
    type('#auth-email', 'admin@example.com');
    type('#auth-password', 'segreta123');
    submit();

    // Quello che fa InactivityService appena la sessione esiste.
    fixture.destroy();
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('auth.success_title'), 'success', 3000);

    vi.advanceTimersByTime(SUCCESS_DELAY_MS);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('"Ricorda la mia email" salva l\'email e alla riapertura la precompila', () => {
    const first = setup();
    first.type('#auth-email', 'mario@example.com');
    first.type('#auth-password', 'segreta123');
    const remember = first.$<HTMLInputElement>('.auth-check input')!;
    remember.click();
    first.fixture.detectChanges();
    first.submit();
    expect(localStorage.getItem(LAST_LOGIN_EMAIL_KEY)).toBe('mario@example.com');

    TestBed.resetTestingModule();
    const second = setup();
    expect(second.$<HTMLInputElement>('#auth-email')!.value).toBe('mario@example.com');
    expect(second.$<HTMLInputElement>('.auth-check input')!.checked).toBe(true);
  });

  it('senza spunta, un\'email ricordata in precedenza viene dimenticata', () => {
    localStorage.setItem(LAST_LOGIN_EMAIL_KEY, 'vecchia@example.com');
    const { $, type, submit, fixture } = setup();
    $<HTMLInputElement>('.auth-check input')!.click();
    fixture.detectChanges();
    type('#auth-password', 'segreta123');
    submit();
    expect(localStorage.getItem(LAST_LOGIN_EMAIL_KEY)).toBeNull();
  });

  it('credenziali errate: errore tradotto dentro la card, nessuno snackbar in inglese', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Invalid credentials' } })));
    const { $, type, submit } = setup();
    type('#auth-email', 'mario@example.com');
    type('#auth-password', 'sbagliata');
    submit();
    const alert = $('.auth-alert')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('auth.login_error');
    expect(alert.textContent).not.toContain('Invalid credentials');
    expect($<HTMLButtonElement>('.submit-btn')!.disabled).toBe(false);
  });

  it('email non verificata: il pulsante nell\'errore invia il codice e passa alla verifica', () => {
    auth.login.mockReturnValue(throwError(() => ({
      status: 401,
      error: { message: 'Please verify your email before logging in. Check your inbox for the verification code.' },
    })));
    const { $, type, submit, fixture } = setup();
    type('#auth-email', 'mario@example.com');
    type('#auth-password', 'segreta123');
    submit();

    $<HTMLButtonElement>('.auth-alert .auth-link')!.click();
    fixture.detectChanges();
    expect(auth.requestOtp).toHaveBeenCalledWith('mario@example.com');
    expect($('#auth-tab-code')!.getAttribute('aria-selected')).toBe('true');
    expect($('.code-sent strong')!.textContent).toBe('mario@example.com');
  });

  it('"Password dimenticata?" porta al login con codice con l\'email già compilata', () => {
    const { $, type, fixture } = setup();
    type('#auth-email', 'mario@example.com');
    $<HTMLButtonElement>('.field__label-row .auth-link')!.click();
    fixture.detectChanges();
    expect($('#auth-tab-code')!.getAttribute('aria-selected')).toBe('true');
    expect($<HTMLInputElement>('#auth-identifier')!.value).toBe('mario@example.com');
    expect($('.auth-note')!.textContent).toContain('auth.forgot_hint');
  });

  it('frecce sinistra/destra cambiano scheda', () => {
    const { $, fixture } = setup();
    $('.auth-tabs')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect($('#auth-tab-code')!.getAttribute('aria-selected')).toBe('true');
    $('.auth-tabs')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    expect($('#auth-tab-password')!.getAttribute('aria-selected')).toBe('true');
  });

  it('login con codice: 6 cifre incollate verificano subito, senza click', () => {
    vi.useFakeTimers();
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    type('#auth-identifier', 'mario@example.com');
    submit();
    expect(auth.requestOtp).toHaveBeenCalledWith('mario@example.com');
    expect($('.code-meta__timer')!.textContent).toContain('5:00');

    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect($('.code-meta__timer')!.textContent).toContain('4:57');

    type('.otp__input', '12 34-56');
    expect(auth.verifyOtp).toHaveBeenCalledWith('mario@example.com', '123456');
    expect($('.auth-success')).not.toBeNull();
  });

  it('codice errato: mostra i tentativi rimasti e svuota le caselle', () => {
    auth.verifyOtp.mockReturnValue(throwError(() => ({ status: 401, error: { message: 'Invalid OTP code. 2 attempts remaining.' } })));
    const { $, type, submit, fixture, cmp } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    type('#auth-identifier', 'mario@example.com');
    submit();
    type('.otp__input', '000000');
    expect($('.auth-alert')!.textContent).toContain('auth.err_otp_wrong');
    expect(cmp.otpValue()).toBe('');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.otp__slot--filled')).length).toBe(0);
  });

  it('il reinvio del codice è bloccato per 60 secondi', () => {
    vi.useFakeTimers();
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    $<HTMLButtonElement>('#auth-channel-sms')!.click();
    fixture.detectChanges();
    type('#auth-identifier', '+393331234567');
    submit();
    const resend = () => $<HTMLButtonElement>('.code-meta .auth-link')!;
    expect(resend().disabled).toBe(true);
    expect($('.code-sent strong')!.textContent).toBe('+393331234567');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    expect(resend().disabled).toBe(false);
    resend().click();
    expect(auth.requestOtp).toHaveBeenCalledTimes(2);
  });

  it('identificativo non valido: nessun invio', () => {
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    type('#auth-identifier', '3331234567');
    submit();
    expect(auth.requestOtp).not.toHaveBeenCalled();
    expect($('#auth-identifier-error')!.textContent).toContain('auth.email_required');
  });

  it('cellulare: un numero italiano scritto con gli spazi parte in formato E.164', () => {
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    $<HTMLButtonElement>('#auth-channel-sms')!.click();
    fixture.detectChanges();

    const input = $<HTMLInputElement>('#auth-identifier')!;
    expect(input.type).toBe('tel');
    expect(input.getAttribute('inputmode')).toBe('tel');
    expect($('#auth-channel-sms')!.getAttribute('aria-pressed')).toBe('true');
    expect($('.auth-note')!.textContent).toContain('auth.code_hint_sms');

    type('#auth-identifier', '333 123 4567');
    submit();
    expect(auth.requestOtp).toHaveBeenCalledWith('+393331234567');
    expect($('.code-sent strong')!.textContent).toBe('+393331234567');
    expect($('.code-sent__icon mat-icon')!.textContent).toContain('sms');
  });

  it('cellulare non valido: errore dedicato e nessun invio', () => {
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    $<HTMLButtonElement>('#auth-channel-sms')!.click();
    fixture.detectChanges();
    type('#auth-identifier', '12');
    submit();
    expect(auth.requestOtp).not.toHaveBeenCalled();
    expect($('#auth-identifier-error')!.textContent).toContain('auth.mobile_invalid');
  });

  it('passando da Email a Cellulare e ritorno ciò che era scritto resta', () => {
    const { $, type, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    type('#auth-identifier', 'mario@example.com');
    $<HTMLButtonElement>('#auth-channel-sms')!.click();
    fixture.detectChanges();
    expect($<HTMLInputElement>('#auth-identifier')!.value).toBe('');
    type('#auth-identifier', '3331234567');
    $<HTMLButtonElement>('#auth-channel-email')!.click();
    fixture.detectChanges();
    expect($<HTMLInputElement>('#auth-identifier')!.value).toBe('mario@example.com');
  });

  it('senza provider SMS sul backend la scelta del cellulare non compare', () => {
    auth.getOtpChannels.mockReturnValue(of({ email: true, sms: false }));
    const { $, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    expect($('.channel-switch')).toBeNull();
    expect($<HTMLInputElement>('#auth-identifier')!.getAttribute('inputmode')).toBe('email');
  });

  it('se la richiesta dei canali fallisce resta l\'email, senza errori', () => {
    auth.getOtpChannels.mockReturnValue(throwError(() => ({ status: 0 })));
    const { $, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    expect($('.channel-switch')).toBeNull();
    expect($('.auth-alert')).toBeNull();
  });

  it('"Password dimenticata?" resta sull\'email: il cellulare aprirebbe un altro account', () => {
    const { $, type, fixture } = setup();
    type('#auth-email', 'mario@example.com');
    $<HTMLButtonElement>('.field__label-row .auth-link')!.click();
    fixture.detectChanges();
    expect($('.channel-switch')).toBeNull();
  });

  it('SMS non disponibile al momento dell\'invio: messaggio che rimanda all\'email', () => {
    auth.requestOtp.mockReturnValue(throwError(() => ({
      status: 503,
      error: { message: 'SMS delivery is not available. Please use email.' },
    })));
    const { $, type, submit, fixture } = setup();
    $<HTMLButtonElement>('#auth-tab-code')!.click();
    fixture.detectChanges();
    $<HTMLButtonElement>('#auth-channel-sms')!.click();
    fixture.detectChanges();
    type('#auth-identifier', '3331234567');
    submit();
    expect($('.auth-alert')!.textContent).toContain('auth.err_sms_unavailable');
    expect($('.code-sent')).toBeNull();
  });

  it('Bloc Maiusc: avviso visibile solo mentre è attivo', () => {
    const { $, fixture } = setup();
    const pw = $<HTMLInputElement>('#auth-password')!;
    const key = (caps: boolean) => {
      const ev = new KeyboardEvent('keyup', { key: 'a' });
      Object.defineProperty(ev, 'getModifierState', { value: (k: string) => k === 'CapsLock' && caps });
      pw.dispatchEvent(ev);
      fixture.detectChanges();
    };
    key(true);
    expect($('#auth-caps')).not.toBeNull();
    key(false);
    expect($('#auth-caps')).toBeNull();
  });

  it('mostra/nasconde la password', () => {
    const { $, fixture } = setup();
    const toggle = $<HTMLButtonElement>('.field__toggle')!;
    expect($<HTMLInputElement>('#auth-password')!.type).toBe('password');
    toggle.click();
    fixture.detectChanges();
    expect($<HTMLInputElement>('#auth-password')!.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('il link di registrazione chiude il modale embedded invece di lasciarlo sopra la pagina', () => {
    const { $ } = setup();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    $<HTMLAnchorElement>('.auth-card__footer a')!.click();
    expect(authModal.closeLogin).toHaveBeenCalled();
  });

  it('blocca lo scroll della pagina mentre è aperto e lo ripristina alla chiusura', () => {
    document.body.style.overflow = 'auto';
    const { fixture } = setup();
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('Esc chiude il modale, ma non durante il login', () => {
    const { type, submit } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(authModal.closeLogin).toHaveBeenCalledTimes(1);

    auth.login.mockReturnValue(NEVER); // richiesta ancora in corso
    type('#auth-email', 'mario@example.com');
    type('#auth-password', 'segreta123');
    submit();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(authModal.closeLogin).toHaveBeenCalledTimes(1);
  });
});
