import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';

function passwordsMatch(ctrl: AbstractControl) {
  const pw = ctrl.get('password')?.value;
  const cpw = ctrl.get('confirmPassword')?.value;
  return pw && cpw && pw !== cpw ? { mismatch: true } : null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatInputModule, MatFormFieldModule, MatButtonModule, MatIconModule, MatSnackBarModule,
    TranslateModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card card fade-in-up">
        <div class="auth-card__header">
          <h1 class="logo"><span class="logo-bracket">&lt;</span>Admin<span class="logo-bracket">/&gt;</span></h1>
          <p class="text-muted">{{ 'auth.register_subtitle' | translate }}</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="register()" novalidate>
          <mat-form-field appearance="outline" class="form-field">
            <mat-label>{{ 'auth.name' | translate }}</mat-label>
            <input matInput formControlName="name" [placeholder]="'auth.name' | translate" />
            @if (form.get('name')?.invalid && form.get('name')?.touched) {
              <mat-error>{{ 'auth.name_required' | translate }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="form-field">
            <mat-label>{{ 'auth.email' | translate }}</mat-label>
            <input matInput formControlName="email" type="email" />
            @if (form.get('email')?.invalid && form.get('email')?.touched) {
              <mat-error>{{ 'auth.email_required' | translate }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="form-field">
            <mat-label>{{ 'auth.password' | translate }}</mat-label>
            <input matInput formControlName="password" [type]="showPw ? 'text' : 'password'" />
            <button mat-icon-button matSuffix type="button" (click)="showPw = !showPw">
              <mat-icon>{{ showPw ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (form.get('password')?.invalid && form.get('password')?.touched) {
              <mat-error>{{ 'auth.password_required' | translate }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="form-field">
            <mat-label>{{ 'auth.confirm_password' | translate }}</mat-label>
            <input matInput formControlName="confirmPassword" [type]="showPw ? 'text' : 'password'" />
            @if (form.hasError('mismatch') && form.get('confirmPassword')?.touched) {
              <mat-error>{{ 'auth.passwords_mismatch' | translate }}</mat-error>
            }
          </mat-form-field>

          <button mat-raised-button color="primary" type="submit" [disabled]="loading" class="submit-btn">
            @if (loading) { <mat-icon class="spin">sync</mat-icon> } @else { <mat-icon>person_add</mat-icon> }
            {{ (loading ? 'auth.registering' : 'auth.register_btn') | translate }}
          </button>
        </form>

        <p class="auth-card__footer text-muted">
          {{ 'auth.have_account' | translate }}
          <a routerLink="/admin/login">{{ 'auth.sign_in' | translate }}</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg-primary); padding:1.5rem; }
    .auth-card { width:100%; max-width:440px; padding:2.5rem; }
    .auth-card__header { text-align:center; margin-bottom:2rem; }
    .auth-card__footer { text-align:center; margin-top:1.25rem; font-size:0.9rem; }
    .logo { font-size:1.8rem; font-weight:800; margin-bottom:0.5rem; }
    .logo-bracket { color:var(--primary-500); }
    .form-field { width:100%; margin-bottom:0.5rem; }
    .submit-btn { width:100%; margin-top:0.75rem; padding:0.75rem; display:flex; align-items:center; justify-content:center; gap:0.5rem; }
    .text-muted { color:var(--text-secondary); }
    @keyframes spin { to { transform:rotate(360deg); } } .spin { animation:spin 1s linear infinite; }
  `],
})
export class RegisterComponent {
  form = this.fb.group({
    name:            ['', [Validators.required, Validators.maxLength(60)]],
    email:           ['', [Validators.required, Validators.email]],
    password:        ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: passwordsMatch });

  loading = false;
  showPw = false;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private translate: TranslateService,
  ) {}

  register(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;

    const { name, email, password } = this.form.value as any;
    this.auth.register({ name, email, password }).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (err) => {
        this.loading = false;
        const msg = err?.error?.message || this.translate.instant('common.error');
        this.snackBar.open(msg, this.translate.instant('common.close'), { duration: 4000 });
      },
    });
  }
}
