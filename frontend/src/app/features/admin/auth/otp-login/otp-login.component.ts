import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';

const OTP_EXPIRY_SECONDS = 300; // matches backend 5-minute window
const RESEND_COOLDOWN_SECONDS = 60;

/** Validates that the value is either a valid E.164 phone OR a valid email. */
function phoneOrEmailValidator(control: AbstractControl): ValidationErrors | null {
  const v: string = (control.value ?? '').trim();
  if (!v) return { required: true };
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = /^\+[1-9]\d{6,14}$/.test(v);
  return isEmail || isPhone ? null : { phoneOrEmail: true };
}

@Component({
  selector: 'app-otp-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './otp-login.component.html',
  styleUrls: ['./otp-login.component.scss'],
})
export class OtpLoginComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('identifierInput') private identifierInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('otpInput') private otpInputRef?: ElementRef<HTMLInputElement>;

  step: 'identifier' | 'otp' = 'identifier';
  identifier = '';
  loading = false;
  otpExpired = false;

  countdownSeconds = OTP_EXPIRY_SECONDS;
  resendCooldownSeconds = 0;

  identifierForm = this.fb.group({
    identifier: ['', [Validators.required, phoneOrEmailValidator]],
  });

  otpForm = this.fb.group({
    otp: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  private countdownSub?: Subscription;
  private resendSub?: Subscription;
  private redirectTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Arriving here right after registration: the backend already sent the
    // verification OTP as part of /auth/register, so land straight on step 2
    // with that email pre-filled instead of making the user re-request it.
    const params = this.route.snapshot.queryParamMap;
    const email = params.get('email');
    if (email && params.get('sent') === '1') {
      this.identifierForm.patchValue({ identifier: email });
      this.identifier = email;
      this.step = 'otp';
      this.startCountdown();
      this.startResendCooldown();
    }
  }

  ngAfterViewInit(): void {
    if (this.step === 'otp') {
      setTimeout(() => this.otpInputRef?.nativeElement.focus(), 0);
      return;
    }
    setTimeout(() => this.identifierInputRef?.nativeElement.focus(), 0);
  }

  ngOnDestroy(): void {
    this.countdownSub?.unsubscribe();
    this.resendSub?.unsubscribe();
    if (this.redirectTimeout) clearTimeout(this.redirectTimeout);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (!this.loading) this.router.navigate(['/']);
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

  get isEmail(): boolean {
    return this.identifier.includes('@');
  }

  get identifierIcon(): string {
    const raw = (this.identifierForm.value.identifier ?? '').trim();
    return raw.includes('@') ? 'email' : 'phone_iphone';
  }

  get formattedCountdown(): string {
    const m = Math.floor(this.countdownSeconds / 60);
    const s = this.countdownSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  requestOtp(): void {
    if (this.identifierForm.invalid) {
      this.identifierForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const id = this.identifierForm.value.identifier!.trim();

    this.auth.requestOtp(id).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.markForCheck();
        this.identifier = id;
        this.step = 'otp';
        this.otpExpired = false;
        this.otpForm.reset();
        this.startCountdown();
        this.startResendCooldown();
        // Il campo OTP esiste solo dopo che l'@if dello step 2 lo renderizza.
        setTimeout(() => this.otpInputRef?.nativeElement.focus(), 0);
      },
      error: (err) => {
        this.loading = false;
        this.cdr.markForCheck();
        const rawMsg = err?.error?.message;
        const msg = Array.isArray(rawMsg)
          ? rawMsg.join(' ')
          : rawMsg || this.translate.instant('auth.otp_send_failed');
        this.snackBar.open(msg, this.translate.instant('common.close'), {
          duration: 5000,
        });
      },
    });
  }

  verifyOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    if (this.otpExpired) return;

    this.loading = true;
    const otp = this.otpForm.value.otp!.trim();

    this.auth.verifyOtp(this.identifier, otp).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.markForCheck();
        if (this.auth.isAdmin()) {
          this.redirectTimeout = setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 80);
        } else {
          // Un account 'user' non ha nulla da fare in /dashboard, ma la sessione
          // è comunque valida — niente logout né rifiuto, si torna alla home.
          this.router.navigate(['/']);
        }
      },
      error: (err) => {
        this.loading = false;
        this.cdr.markForCheck();
        const rawMsg = err?.error?.message;
        const msg = Array.isArray(rawMsg)
          ? rawMsg.join(' ')
          : rawMsg || this.translate.instant('auth.otp_invalid');
        this.snackBar.open(msg, this.translate.instant('common.close'), {
          duration: 5000,
        });
        this.otpForm.reset();
      },
    });
  }

  resendOtp(): void {
    if (this.resendCooldownSeconds > 0 || this.loading) return;
    this.loading = true;

    this.auth.requestOtp(this.identifier).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.markForCheck();
        this.otpExpired = false;
        this.otpForm.reset();
        this.startCountdown();
        this.startResendCooldown();
        this.snackBar.open(
          this.translate.instant('auth.otp_resent'),
          this.translate.instant('common.close'),
          { duration: 3000 },
        );
      },
      error: (err) => {
        this.loading = false;
        this.cdr.markForCheck();
        const rawMsg = err?.error?.message;
        const msg = Array.isArray(rawMsg)
          ? rawMsg.join(' ')
          : rawMsg || this.translate.instant('auth.otp_send_failed');
        this.snackBar.open(msg, this.translate.instant('common.close'), {
          duration: 5000,
        });
      },
    });
  }

  backToIdentifier(): void {
    this.countdownSub?.unsubscribe();
    this.resendSub?.unsubscribe();
    this.step = 'identifier';
    this.otpForm.reset();
    this.otpExpired = false;
    this.countdownSeconds = OTP_EXPIRY_SECONDS;
    this.resendCooldownSeconds = 0;
  }

  private startCountdown(): void {
    this.countdownSub?.unsubscribe();
    this.countdownSeconds = OTP_EXPIRY_SECONDS;
    this.countdownSub = interval(1000).subscribe(() => {
      this.countdownSeconds--;
      if (this.countdownSeconds <= 0) {
        this.countdownSeconds = 0;
        this.otpExpired = true;
        this.countdownSub?.unsubscribe();
      }
      // Drives a visible per-second countdown: without an explicit mark the
      // timer would freeze on screen under zoneless change detection.
      this.cdr.markForCheck();
    });
  }

  private startResendCooldown(): void {
    this.resendSub?.unsubscribe();
    this.resendCooldownSeconds = RESEND_COOLDOWN_SECONDS;
    this.resendSub = interval(1000).subscribe(() => {
      this.resendCooldownSeconds--;
      if (this.resendCooldownSeconds <= 0) {
        this.resendCooldownSeconds = 0;
        this.resendSub?.unsubscribe();
      }
      this.cdr.markForCheck();
    });
  }
}

