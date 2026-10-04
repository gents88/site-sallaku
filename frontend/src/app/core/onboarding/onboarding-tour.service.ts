import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type { DriveStep, Driver } from 'driver.js';
import { filter, take } from 'rxjs';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';
import { AuthService } from '../services/auth.service';
import { ConsentService } from '../services/consent.service';
import { DrawerService } from '../services/drawer.service';
import { ONBOARDING_STEPS, OnboardingStepDef } from './onboarding-steps';

/** Flag di primo accesso: presente = tour già visto (completato o saltato). */
export const ONBOARDING_STORAGE_KEY = 'hasSeenOnboarding';

/** Attesa dopo la decisione sul consenso, per non partire sopra una pagina ancora in assestamento. */
const AUTO_START_DELAY_MS = 1500;
/** Il chatbot è in `@defer (on idle)`: al primo accesso il suo pulsante può non esserci ancora. */
const CHATBOT_WAIT_MS = 4000;
/** Durata della transizione di larghezza della rail (sidebar.component.scss). */
const RAIL_TRANSITION_MS = 320;

/** Rotte dell'area admin: il tour è pensato per i visitatori del sito pubblico. */
const ADMIN_ROUTE = /(^|\/)dashboard(\/|$|\?)/;

/**
 * Tour guidato di primo accesso (spotlight + popover) basato su Driver.js.
 *
 * - Parte da solo una volta per browser, solo dopo che il banner del consenso
 *   è stato chiuso (altrimenti i due overlay si sovrapporrebbero), mai
 *   nell'area admin né per un admin loggato.
 * - `start()` lo riavvia a mano (link "Guida" nel footer) ignorando il flag.
 * - Driver.js è caricato con import() dinamico: chi non vede mai il tour non
 *   ne scarica il codice.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly consent = inject(ConsentService);
  private readonly auth = inject(AuthService);
  private readonly drawer = inject(DrawerService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly consentDecided$ = toObservable(this.consent.hasDecided);

  private instance: Driver | null = null;
  private autoStartTimer: ReturnType<typeof setTimeout> | null = null;

  /** True mentre il tour è visibile (o in fase di avvio). */
  readonly active = signal(false);

  /** Da chiamare una volta all'avvio dell'app (AppComponent). */
  scheduleAutoStart(): void {
    if (!this.isBrowser || this.hasSeen()) return;
    this.consentDecided$
      .pipe(filter(Boolean), take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.autoStartTimer = setTimeout(() => {
          this.autoStartTimer = null;
          if (this.shouldAutoStart()) void this.start();
        }, AUTO_START_DELAY_MS);
      });
  }

  /** Avvia (o riavvia) il tour. Ritorna quando il primo step è a schermo. */
  async start(): Promise<void> {
    if (!this.isBrowser || this.active()) return;
    this.active.set(true);
    if (this.autoStartTimer) {
      clearTimeout(this.autoStartTimer);
      this.autoStartTimer = null;
    }

    let restoreLayout = () => {};
    try {
      const [{ driver }, restore] = await Promise.all([
        import('driver.js'),
        this.prepareLayout(),
        this.waitForElement('.cb-fab', CHATBOT_WAIT_MS),
      ]);
      restoreLayout = restore;

      const steps = ONBOARDING_STEPS.map(def => this.toDriveStep(def));
      const reducedMotion = this.prefersReducedMotion();
      const t = (key: string, params?: Record<string, string>) => this.translate.instant(key, params) as string;
      let completed = false;

      this.instance = driver({
        steps,
        animate: !reducedMotion,
        smoothScroll: !reducedMotion,
        allowClose: true, // Esc / click sull'overlay = "Salta"
        overlayClickBehavior: 'close',
        allowKeyboardControl: true,
        stagePadding: 8,
        stageRadius: 14,
        popoverOffset: 12,
        popoverClass: 'gs-tour',
        showProgress: true,
        // Driver.js sostituisce {{current}}/{{total}}: li si passa come
        // parametri così ngx-translate non li tratta come propri placeholder.
        progressText: t('onboarding.progress', { current: '{{current}}', total: '{{total}}' }),
        // La "X" è ridondante con "Salta tutorial": la si nasconde.
        showButtons: ['next', 'previous'],
        nextBtnText: t('onboarding.next'),
        prevBtnText: t('onboarding.back'),
        doneBtnText: t('onboarding.done'),
        onPopoverRender: (popover, { driver: d }) => {
          if (d.isLastStep()) return;
          const skip = this.document.createElement('button');
          skip.type = 'button';
          skip.className = 'gs-tour__skip';
          skip.textContent = t('onboarding.skip');
          skip.addEventListener('click', () => d.destroy());
          popover.footer.insertBefore(skip, popover.footer.firstChild);
          // Driver.js, subito dopo questo hook, mette a fuoco il primo pulsante
          // del popover, che ora sarebbe "Salta": il focus va sull'azione primaria.
          queueMicrotask(() => popover.nextButton.focus());
        },
        onDoneClick: (_el, _step, { driver: d }) => {
          completed = true;
          d.destroy();
        },
        onDestroyed: (_el, _step, { state }) => {
          // Qualunque uscita (Concludi, Salta, Esc, overlay) conta come "visto":
          // il tour non deve riproporsi al prossimo caricamento.
          this.markSeen();
          this.instance = null;
          this.active.set(false);
          restoreLayout();
          this.analytics.trackClick(
            'onboarding',
            completed ? 'onboarding_completed' : `onboarding_skipped_step_${(state.activeIndex ?? 0) + 1}`,
          );
        },
      });

      this.instance.drive();
    } catch {
      // Chunk di driver.js non scaricabile (offline, deploy a metà): il tour è
      // un extra, la pagina deve restare usabile. Il flag non viene scritto
      // così da riprovare al prossimo accesso.
      this.instance = null;
      this.active.set(false);
      restoreLayout();
    }
  }

  /** Chiude il tour se aperto (es. su cambio rotta pilotato dal codice). */
  stop(): void {
    this.instance?.destroy();
  }

  hasSeen(): boolean {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
    } catch {
      // Storage bloccato: meglio non mostrare il tour a ogni caricamento.
      return true;
    }
  }

  /** Dimentica il flag: il tour ripartirà da solo al prossimo caricamento. */
  reset(): void {
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    } catch {
      /* storage non disponibile */
    }
  }

  private markSeen(): void {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      /* storage non disponibile: il tour potrà ripresentarsi, non è un errore */
    }
  }

  private shouldAutoStart(): boolean {
    if (this.hasSeen()) return false;
    if (this.auth.isLoggedIn() && this.auth.isAdmin()) return false;
    return !ADMIN_ROUTE.test(this.router.url);
  }

  /**
   * Su desktop la rail collassata mostra solo icone: la si espande per la
   * durata del tour (gli step dei gruppi spiegano le etichette) e la si
   * riporta com'era alla fine. Ritorna la funzione di ripristino.
   */
  private async prepareLayout(): Promise<() => void> {
    if (this.drawer.mode() !== 'rail' || this.drawer.railExpanded()) return () => {};
    this.drawer.open();
    // Lo spotlight va calcolato sulla rail già espansa, non a metà transizione.
    await this.delay(this.prefersReducedMotion() ? 0 : RAIL_TRANSITION_MS);
    return () => {
      if (this.drawer.mode() === 'rail' && this.drawer.railExpanded()) this.drawer.toggleRail();
    };
  }

  private toDriveStep(def: OnboardingStepDef): DriveStep {
    const element = this.resolveTarget(def.targets ?? []);
    return {
      element: element ?? undefined,
      popover: {
        title: this.translate.instant(def.titleKey),
        description: this.translate.instant(def.bodyKey),
        // Senza elemento Driver.js centra il popover: side/align non servono.
        ...(element ? { side: def.side, align: def.align } : {}),
      },
    };
  }

  /** Primo candidato presente e visibile (non display:none, non a dimensione zero). */
  private resolveTarget(selectors: string[]): Element | null {
    for (const selector of selectors) {
      const el = this.document.querySelector(selector);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  private waitForElement(selector: string, timeoutMs: number): Promise<void> {
    if (this.document.querySelector(selector)) return Promise.resolve();
    return new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (this.document.querySelector(selector)) done();
      });
      const timer = setTimeout(done, timeoutMs);
      function done() {
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
      observer.observe(this.document.body, { childList: true, subtree: true });
    });
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

function isVisible(el: Element): boolean {
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}
