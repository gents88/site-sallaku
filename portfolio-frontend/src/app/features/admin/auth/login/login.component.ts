import { Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { AuthModalService } from '../../../../core/services/auth-modal.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatInputModule, MatFormFieldModule, MatButtonModule, MatIconModule, MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit, OnDestroy {
  @Input() embedded = false;

  form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  loading = false;
  showPassword = false;
  private redirectTimeoutId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private authModal: AuthModalService,
    private router: Router,
    private snackBar: MatSnackBar,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    if (this.auth.isLoggedIn() && this.auth.isAdmin()) {
      this.scheduleAdminRedirect();
      return;
    }

    if (this.auth.isLoggedIn() && !this.auth.isAdmin()) {
      this.auth.logout();
    }
  }

  ngOnDestroy(): void {
    this.clearRedirectTimeout();
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closeModal();
  }

  closeModal(): void {
    if (this.loading) {
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

  login(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;

    this.auth.login(this.form.value as any).subscribe({
      next: () => {
        if (this.auth.isAdmin()) {
          this.scheduleAdminRedirect();
          return;
        }

        this.loading = false;
        this.auth.logout();
        this.snackBar.open(
          'Questo account non ha accesso alla dashboard admin.',
          this.translate.instant('common.close'),
          { duration: 4000 },
        );
      },
      error: (err) => {
        this.loading = false;
        const msg = err?.error?.message?.message
          || this.translate.instant('auth.email_required');
        this.snackBar.open(msg, this.translate.instant('common.close'), { duration: 4000 });
      },
    });
  }

  private scheduleAdminRedirect(): void {
    this.clearRedirectTimeout();
    this.redirectTimeoutId = window.setTimeout(() => {
      this.loading = false;
      this.authModal.closeLogin();
      this.authModal.closeAccount();
      this.router.navigate(['/admin']);
    }, 80);
  }

  private clearRedirectTimeout(): void {
    if (this.redirectTimeoutId !== null) {
      window.clearTimeout(this.redirectTimeoutId);
      this.redirectTimeoutId = null;
    }
  }
}
