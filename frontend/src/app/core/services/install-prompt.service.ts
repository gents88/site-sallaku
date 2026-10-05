import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PlatformUiService } from './platform-ui.service';
import { labToolIdForUrl } from '../navigation/lab-tools';

/** Evento non standard di Chromium (Chrome, Edge, Samsung Internet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const LAB_USES_KEY = 'gs.lab-tool-uses';
export const INSTALL_DISMISSED_KEY = 'gs.install-dismissed-at';
/** L'invito compare dal secondo strumento del Lab aperto, mai al primo accesso. */
export const LAB_USES_BEFORE_OFFER = 2;
export const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;


function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch { /* storage bloccato: l'invito al massimo ricompare */ }
}

/**
 * Invito a installare il sito come app, pensato per gli strumenti del Lab.
 * Su Chromium usa `beforeinstallprompt`; su iOS Safari (che non lo supporta)
 * mostra le istruzioni "Condividi → Aggiungi a Home".
 */
@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly platformUi = inject(PlatformUiService);
  private deferred: BeforeInstallPromptEvent | null = null;

  private readonly nativeAvailable = signal(false);
  private readonly installed = signal(false);
  private readonly labUses = signal(0);
  private readonly dismissedAt = signal(0);

  /** Il browser può mostrare il proprio dialogo di installazione. */
  readonly canPromptNatively = this.nativeAvailable.asReadonly();

  /** iOS Safari non installato: l'unica via è il menu Condividi. */
  readonly iosManual = computed(() => this.isBrowser && this.platformUi.isIos() && !this.installed() && !this.isStandalone());

  /** C'è un modo di installare (indipendentemente dal momento giusto per proporlo). */
  readonly installable = computed(() => !this.installed() && (this.nativeAvailable() || this.iosManual()));

  /** Momento giusto per l'invito spontaneo: installabile, Lab usato abbastanza, non rifiutato di recente. */
  readonly shouldOffer = computed(() =>
    this.installable() &&
    this.labUses() >= LAB_USES_BEFORE_OFFER &&
    Date.now() - this.dismissedAt() > DISMISS_COOLDOWN_MS,
  );

  constructor() {
    if (!this.isBrowser) return;
    this.installed.set(this.isStandalone());
    this.labUses.set(readNumber(LAB_USES_KEY));
    this.dismissedAt.set(readNumber(INSTALL_DISMISSED_KEY));

    const onPrompt = (e: Event) => {
      e.preventDefault(); // niente mini-infobar automatica: decidiamo noi quando proporlo
      this.deferred = e as BeforeInstallPromptEvent;
      this.nativeAvailable.set(true);
    };
    const onInstalled = () => {
      this.deferred = null;
      this.nativeAvailable.set(false);
      this.installed.set(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    });

    inject(Router).events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        if (labToolIdForUrl(e.urlAfterRedirects)) this.recordLabUse();
      });
  }

  init(): void {
    // Istanzia il servizio presto: `beforeinstallprompt` arriva una sola volta, subito dopo il load.
  }

  recordLabUse(): void {
    const next = this.labUses() + 1;
    this.labUses.set(next);
    writeNumber(LAB_USES_KEY, next);
  }

  /** Apre il dialogo nativo. Restituisce true se l'utente ha installato. */
  async install(): Promise<boolean> {
    const event = this.deferred;
    if (!event) return false;
    this.deferred = null;
    this.nativeAvailable.set(false);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') this.installed.set(true);
    else this.dismiss();
    return outcome === 'accepted';
  }

  /** "Non ora": niente invito spontaneo per 30 giorni (resta l'azione nella palette). */
  dismiss(): void {
    const now = Date.now();
    this.dismissedAt.set(now);
    writeNumber(INSTALL_DISMISSED_KEY, now);
  }

  private isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }
}
