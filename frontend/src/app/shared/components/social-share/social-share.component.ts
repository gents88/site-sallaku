import { Component, Input, inject, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SnackbarService } from '../../../core/services/snackbar.service';
import { TrackClickDirective } from '../../directives/track-click.directive';

/**
 * Share row shown at the bottom of each blog post. Facebook, LinkedIn,
 * X/Twitter, WhatsApp and Telegram all support a pre-filled "share this URL"
 * web link — plain `<a href target="_blank">` navigation, deliberately NOT
 * a JS `window.open()` popup: in-app browsers (Facebook, Instagram, LinkedIn
 * WebViews — exactly where most people tap a shared link from) routinely
 * block or silently swallow JS-triggered popups as a phishing mitigation,
 * which is why the Facebook button opened without ever showing the share
 * dialog. Native anchor navigation isn't affected by that restriction.
 * Instagram has no equivalent web share URL (it's app-only, no public intent
 * for arbitrary links) — that button uses the native Web Share API instead
 * (opens the device's real share sheet, Instagram included, on phones/tablets
 * that support it) and falls back to copy-link on desktop browsers that don't.
 */
@Component({
  selector: 'app-social-share',
  standalone: true,
  imports: [CommonModule, TranslateModule, TrackClickDirective],
  template: `
    <div class="social-share">
      <span class="social-share__label">{{ 'blog.share.title' | translate }}</span>
      <div class="social-share__buttons">
        <a [href]="facebookUrl" class="social-share__btn social-share__btn--facebook"
           appTrackClick eventType="share" label="share_facebook" [attr.aria-label]="'blog.share.facebook' | translate" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-facebook-f" aria-hidden="true"></i>
        </a>
        <a [href]="linkedinUrl" class="social-share__btn social-share__btn--linkedin"
           appTrackClick eventType="share" label="share_linkedin" [attr.aria-label]="'blog.share.linkedin' | translate" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-linkedin-in" aria-hidden="true"></i>
        </a>
        <a [href]="twitterUrl" class="social-share__btn social-share__btn--twitter"
           appTrackClick eventType="share" label="share_twitter" [attr.aria-label]="'blog.share.twitter' | translate" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-x-twitter" aria-hidden="true"></i>
        </a>
        <a [href]="whatsappUrl" class="social-share__btn social-share__btn--whatsapp"
           appTrackClick eventType="share" label="share_whatsapp" [attr.aria-label]="'blog.share.whatsapp' | translate" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-whatsapp" aria-hidden="true"></i>
        </a>
        <a [href]="telegramUrl" class="social-share__btn social-share__btn--telegram"
           appTrackClick eventType="share" label="share_telegram" [attr.aria-label]="'blog.share.telegram' | translate" target="_blank" rel="noopener noreferrer">
          <i class="fab fa-telegram" aria-hidden="true"></i>
        </a>
        <button type="button" (click)="shareToInstagram()" class="social-share__btn social-share__btn--instagram"
                appTrackClick eventType="share" label="share_instagram" [attr.aria-label]="'blog.share.instagram' | translate">
          <i class="fab fa-instagram" aria-hidden="true"></i>
        </button>
        <button type="button" (click)="copyLink()" class="social-share__btn social-share__btn--copy"
                appTrackClick eventType="share" label="share_copy_link" [attr.aria-label]="'blog.share.copyLink' | translate">
          <i class="fas" [class.fa-check]="copied()" [class.fa-link]="!copied()" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .social-share {
      display: flex; align-items: center; flex-wrap: wrap; gap: 12px;
      margin: 32px 0; padding: 16px 20px;
      background: rgba(79,106,245,0.05);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md, 10px);
    }
    .social-share__label {
      font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);
      margin-right: 4px;
    }
    .social-share__buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .social-share__btn {
      display: flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--bg-tertiary, #141a2e);
      border: 1px solid var(--glass-border);
      color: var(--text-secondary);
      cursor: pointer; text-decoration: none;
      font-size: 0.95rem;
      transition: transform 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      &:hover { transform: translateY(-2px); color: var(--text-primary); }
    }
    .social-share__btn--facebook:hover { color: #1877f2; border-color: #1877f2; }
    .social-share__btn--linkedin:hover { color: #0a66c2; border-color: #0a66c2; }
    .social-share__btn--twitter:hover { color: #000; border-color: #000; }
    .social-share__btn--whatsapp:hover { color: #25d366; border-color: #25d366; }
    .social-share__btn--telegram:hover { color: #26a5e4; border-color: #26a5e4; }
    .social-share__btn--instagram:hover { color: #e1306c; border-color: #e1306c; }
    .social-share__btn--copy .fa-check { color: #22c55e; }
  `],
})
export class SocialShareComponent {
  @Input({ required: true }) url!: string;
  @Input({ required: true }) title!: string;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackbar = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  readonly copied = signal(false);

  get facebookUrl(): string {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.url)}`;
  }
  get linkedinUrl(): string {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.url)}`;
  }
  get twitterUrl(): string {
    return `https://twitter.com/intent/tweet?url=${encodeURIComponent(this.url)}&text=${encodeURIComponent(this.title)}`;
  }
  get whatsappUrl(): string {
    return `https://wa.me/?text=${encodeURIComponent(this.title + ' ' + this.url)}`;
  }
  get telegramUrl(): string {
    return `https://t.me/share/url?url=${encodeURIComponent(this.url)}&text=${encodeURIComponent(this.title)}`;
  }

  /**
   * Instagram has no web "share this link" intent. On phones/tablets with
   * Web Share API support, this opens the native share sheet (which
   * includes Instagram if installed) pre-filled with the article; anywhere
   * else it falls back to copying the link so the user can paste it into
   * an Instagram bio/story/DM manually.
   */
  async shareToInstagram(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: this.title, url: this.url });
        return;
      } catch {
        // user cancelled the native share sheet — no fallback needed
        return;
      }
    }
    this.copyLink();
  }

  async copyLink(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await navigator.clipboard.writeText(this.url);
      this.copied.set(true);
      this.snackbar.show(this.translate.instant('blog.share.linkCopied'), 'success', 2500);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.snackbar.show(this.url, 'info', 6000);
    }
  }
}
