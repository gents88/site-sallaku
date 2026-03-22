import { Component, HostListener, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
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
export class OtpLoginComponent implements OnDestroy {
  step: 'phone' | 'otp' = 'phone';
  phone = '';
  loading = false;
  otpExpired = false;

  countdownSeconds = OTP_EXPIRY_SECONDS;
  resendCooldownSeconds = 0;

  phoneForm = this.fb.group({
    phone: [
      '',
      [Validators.required, Validators.pattern(/^\+[1-9]\d{6,14}$/)],
    ],
  });

  otpForm = this.fb.group({
    otp: [
      '',
      [Validators.required, Validators.pattern(/^\d{6}$/)],
    ],
  });

  private countdownSub?: Subscription;
  private resendSub?: Subscription;
  private redirectTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private translate: TranslateService,
  ) {}

  ngOnDestroy(): void {
    this.countdownSub?.unsubscribe();
    this.resendSub?.unsubscribe();
    if (this.redirectTimeout) clearTimeout(this.redirectTimeout);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (!this.loading) this.router.navigate(['/']);
  }

  get formattedCountdown(): string {
    const m = Math.floor(this.countdownSeconds / 60);
    const s = this.countdownSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  requestOtp(): void {
    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const phone = this.phoneForm.value.phone!.trim();

    this.auth.requestOtp(phone).subscribe({
      next: () => {
        this.loading = false;
        this.phone = phone;
        this.step = 'otp';
        this.otpExpired = false;
        this.otpForm.reset();
        this.startCountdown();
        this.startResendCooldown();
      },
      error: (err) => {
        this.loading = false;
        const msg =
          err?.error?.message ||
          this.translate.instant('auth.otp_send_failed');
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

    this.auth.verifyOtp(this.phone, otp).subscribe({
      next: () => {
        this.loading = false;
        if (this.auth.isAdmin()) {
          this.redirectTimeout = setTimeout(() => {
            this.router.navigate(['/admin']);
          }, 80);
        } else {
          this.auth.logout();
          this.snackBar.open(
            this.translate.instant('auth.not_admin'),
            this.translate.instant('common.close'),
            { duration: 4000 },
          );
        }
      },
      error: (err) => {
        this.loading = false;
        const msg =
          err?.error?.message ||
          this.translate.instant('auth.otp_invalid');
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

    this.auth.requestOtp(this.phone).subscribe({
      next: () => {
        this.loading = false;
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
        const msg =
          err?.error?.message ||
          this.translate.instant('auth.otp_send_failed');
        this.snackBar.open(msg, this.translate.instant('common.close'), {
          duration: 5000,
        });
      },
    });
  }

  backToPhone(): void {
    this.countdownSub?.unsubscribe();
    this.resendSub?.unsubscribe();
    this.step = 'phone';
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
    });
  }
}
