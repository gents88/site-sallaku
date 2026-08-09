import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID, effect, signal } from '@angular/core';
import { Platform } from '@angular/cdk/platform';
import { BreakpointObserver } from '@angular/cdk/layout';

export type PlatformOs = 'ios' | 'android' | 'other';
export type FormFactor = 'phone' | 'tablet' | 'desktop';
export type InputMode = 'touch' | 'pointer';

// Same phone/tablet cutoff used by the mobile nav menu (navbar.component.scss).
const PHONE_MAX_WIDTH = '(max-width: 640px)';

@Injectable({ providedIn: 'root' })
export class PlatformUiService {
  readonly os = signal<PlatformOs>('other');
  readonly formFactor = signal<FormFactor>('desktop');
  readonly inputMode = signal<InputMode>('pointer');

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly platform: Platform,
    private readonly breakpoints: BreakpointObserver,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.os.set(this.detectOs());
      this.inputMode.set(this.detectInputMode());
      this.formFactor.set(this.detectFormFactor());

      this.breakpoints.observe([PHONE_MAX_WIDTH]).subscribe(() => {
        this.formFactor.set(this.detectFormFactor());
      });
    }

    // Reflect state onto <html> so CSS can key off it — no per-component branching.
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const root = this.document.documentElement;
      root.setAttribute('data-os', this.os());
      root.setAttribute('data-form-factor', this.formFactor());
      root.setAttribute('data-input', this.inputMode());
    });
  }

  init(): void {
    // Triggers constructor-time detection to run (service is providedIn: 'root',
    // so this just guarantees it's instantiated early, mirroring ThemeService.init()).
  }

  isIos(): boolean {
    return this.os() === 'ios';
  }

  isAndroid(): boolean {
    return this.os() === 'android';
  }

  private detectOs(): PlatformOs {
    if (this.platform.IOS) return 'ios';
    if (this.platform.ANDROID) return 'android';

    // iPadOS 13+ reports as "Macintosh" in the UA string but, unlike a real Mac,
    // exposes multi-touch — that's the only reliable signal left to tell them apart.
    const isIpadMasqueradingAsMac =
      /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    if (isIpadMasqueradingAsMac) return 'ios';

    return 'other';
  }

  private detectInputMode(): InputMode {
    return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer';
  }

  private detectFormFactor(): FormFactor {
    if (this.inputMode() === 'pointer') return 'desktop';
    return this.breakpoints.isMatched(PHONE_MAX_WIDTH) ? 'phone' : 'tablet';
  }
}
