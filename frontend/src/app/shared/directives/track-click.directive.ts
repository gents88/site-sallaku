import { Directive, HostListener, Input, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AnalyticsTrackingService } from '../../core/services/analytics-tracking.service';

/**
 * Attribute directive to track any clickable element.
 *
 * Usage:
 *   <a href="..." appTrackClick eventType="affiliate" label="udemy_angular" destination="https://udemy.com/...">
 *   <button appTrackClick eventType="cta" label="hero_contact_btn">
 *   <button appTrackClick eventType="cv_download" label="cv_download_btn">
 */
@Directive({
  selector: '[appTrackClick]',
  standalone: true,
})
export class TrackClickDirective {
  /** Semantic category: 'cta' | 'affiliate' | 'social' | 'contact' | 'cv_download' | 'blog' | 'project' */
  @Input() eventType: string = 'cta';

  /** Unique label identifying this specific element */
  @Input() label: string = '';

  /** Optional destination URL (especially useful for affiliate links) */
  @Input() destination: string = '';

  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly platformId = inject(PLATFORM_ID);

  @HostListener('click')
  onClick(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.label) return;
    this.analytics.trackClick(this.eventType, this.label, this.destination || undefined);
  }
}
