import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() embedded = false;
  @ViewChild('emailInput') private emailInputRef?: ElementRef<HTMLInputElement>;

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
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    if (this.auth.isAdmin()) {
      this.scheduleAdminRedirect();
      return;
    }

    // Already logged in as a plain 'user' account: nothing to reject anymore,
    // just get out of the way of whatever triggered the login UI.
    if (this.embedded) {
      this.authModal.closeLogin();
    } else {
      this.router.navigate(['/']);
    }
  }

  ngAfterViewInit(): void {
    // Solo se il form resta davvero visibile — ngOnInit reindirizza/chiude subito
    // chi è già loggato, e mettere a fuoco un campo in procinto di sparire non serve.
    if (!this.auth.isLoggedIn()) {
      setTimeout(() => this.emailInputRef?.nativeElement.focus(), 0);
    }
  }

  ngOnDestroy(): void {
    this.clearRedirectTimeout();
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
        // Zoneless: an HTTP callback mutating a plain property schedules no
        // change detection on its own, so the spinner would never clear.
        this.cdr.markForCheck();

        if (this.embedded) {
          // Opened from a public /lab tool to unlock saving results — just
          // close the modal, the caller re-checks auth state on its own.
          this.authModal.closeLogin();
        } else {
          // A plain 'user' account has nothing to do in /dashboard.
          this.router.navigate(['/']);
        }
      },
      error: (err) => {
        this.loading = false;
        this.cdr.markForCheck();
        const rawMsg = err?.error?.message;
        const msg = Array.isArray(rawMsg)
          ? rawMsg.join(' ')
          : rawMsg || this.translate.instant('auth.login_error');
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
      this.router.navigate(['/dashboard']);
    }, 80);
  }

  private clearRedirectTimeout(): void {
    if (this.redirectTimeoutId !== null) {
      window.clearTimeout(this.redirectTimeoutId);
      this.redirectTimeoutId = null;
    }
  }
}
