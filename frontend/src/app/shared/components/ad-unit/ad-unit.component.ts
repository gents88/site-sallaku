import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ConsentService } from '../../../core/services/consent.service';

/**
 * Reusable Google AdSense ad unit component.
 *
 * Prerequisites:
 *  1. Add your publisher script to index.html (see comment in that file).
 *  2. Set adClient (ca-pub-XXXXXXXXXXXXXXXX) and adSlot in the template.
 *
 * Usage:
 *   <app-ad-unit adClient="ca-pub-XXXXXXXXXXXXXXXX" adSlot="1234567890" />
 *   <app-ad-unit adClient="ca-pub-XXXXXXXXXXXXXXXX" adSlot="9876543210" adFormat="rectangle" />
 */
@Component({
  selector: 'app-ad-unit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ins class="adsbygoogle"
         [style.display]="'block'"
         [attr.data-ad-client]="adClient"
         [attr.data-ad-slot]="adSlot"
         [attr.data-ad-format]="adFormat"
         data-full-width-responsive="true">
    </ins>
  `,
  styles: [`:host { display: block; min-height: 90px; }`],
})
export class AdUnitComponent implements AfterViewInit, OnDestroy {
  /** Your AdSense publisher ID: ca-pub-XXXXXXXXXXXXXXXX */
  @Input({ required: true }) adClient!: string;

  /** The ad slot ID from your AdSense dashboard */
  @Input({ required: true }) adSlot!: string;

  /** Ad format: 'auto' | 'rectangle' | 'vertical' | 'horizontal' */
  @Input() adFormat: 'auto' | 'rectangle' | 'vertical' | 'horizontal' = 'auto';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly el = inject(ElementRef);
  private readonly consent = inject(ConsentService);

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Only push the ad if the user has explicitly granted marketing consent
    // (Consent Mode v2). AdSense itself also respects the consent signal,
    // but we avoid calling push() entirely otherwise — including while no
    // choice has been made yet, i.e. the banner is still showing.
    if (!this.consent.marketingAllowed()) return;

    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      // Silently ignore errors (ad blockers, test environment, etc.)
    }
  }

  ngOnDestroy(): void {
    // Remove the ins element so it doesn't cause stale ad slots on navigation
    const ins: HTMLElement | null = this.el.nativeElement.querySelector('ins.adsbygoogle');
    if (ins) ins.innerHTML = '';
  }
}
