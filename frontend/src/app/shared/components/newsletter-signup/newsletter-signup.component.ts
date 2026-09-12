import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NewsletterService } from '../../../core/services/newsletter.service';
import { TurnstileWidgetComponent } from '../turnstile-widget/turnstile-widget.component';

type SignupState = 'idle' | 'success' | 'error';

/** Inline email-capture widget — double opt-in newsletter subscription, embeddable anywhere. */
@Component({
  selector: 'app-newsletter-signup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, TranslateModule, TurnstileWidgetComponent],
  templateUrl: './newsletter-signup.component.html',
  styleUrl: './newsletter-signup.component.scss',
})
export class NewsletterSignupComponent {
  email = '';
  loading = false;
  state: SignupState = 'idle';
  errorMessage = '';
  private turnstileToken = '';

  constructor(
    private newsletterService: NewsletterService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  onTurnstileVerified(token: string): void {
    this.turnstileToken = token;
  }

  submit(): void {
    if (!this.email.trim() || this.loading) return;
    this.loading = true;
    this.state = 'idle';

    this.newsletterService.subscribe(this.email.trim(), undefined, this.turnstileToken || undefined).subscribe({
      next: () => {
        this.loading = false;
        this.state = 'success';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.state = 'error';
        const rawMsg = err?.error?.message;
        this.errorMessage = Array.isArray(rawMsg) ? rawMsg.join(' ') : rawMsg || this.translate.instant('newsletter.subscribe_error');
        this.cdr.markForCheck();
      },
    });
  }
}
