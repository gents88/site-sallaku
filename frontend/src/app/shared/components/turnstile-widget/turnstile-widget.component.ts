import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../../environments/environment';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
      ) => string;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve) => {
    if (document.getElementById(SCRIPT_ID)) {
      window.onTurnstileLoad = resolve;
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
    script.async = true;
    script.defer = true;
    window.onTurnstileLoad = resolve;
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Cloudflare Turnstile widget wrapper. Renders nothing and emits nothing if
 * `environment.turnstileSiteKey` is blank — the site keeps working without
 * this extra anti-bot layer until the key is configured, mirroring the
 * backend's TurnstileService no-op when TURNSTILE_SECRET_KEY is unset.
 */
@Component({
  selector: 'app-turnstile-widget',
  standalone: true,
  template: `@if (siteKey) {
    <div class="turnstile-widget"></div>
  }`,
})
export class TurnstileWidgetComponent implements OnInit, OnDestroy {
  @Output() verified = new EventEmitter<string>();

  readonly siteKey = environment.turnstileSiteKey;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly el = inject(ElementRef<HTMLElement>);
  private widgetId: string | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.siteKey || !isPlatformBrowser(this.platformId)) return;

    await loadTurnstileScript();
    const container = this.el.nativeElement.querySelector('.turnstile-widget');
    if (!container || !window.turnstile) return;

    this.widgetId = window.turnstile.render(container, {
      sitekey: this.siteKey,
      callback: (token) => this.verified.emit(token),
      'expired-callback': () => this.verified.emit(''),
    });
  }

  ngOnDestroy(): void {
    if (this.widgetId && window.turnstile) {
      window.turnstile.remove(this.widgetId);
    }
  }
}
