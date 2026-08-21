import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

/**
 * `overlay` — drawer off-canvas sopra il contenuto, con backdrop (mobile/tablet).
 * `rail`    — colonna agganciata sempre visibile che spinge il contenuto (desktop).
 */
export type SidebarMode = 'overlay' | 'rail';

/** Sotto questa soglia non c'è larghezza per una rail agganciata senza comprimere il contenuto. */
const RAIL_MIN_WIDTH = 1200;

const EXPANDED_KEY = 'gs-sidebar-expanded';

/**
 * Unico proprietario dello stato della sidebar.
 *
 * Il valore di `mode` non è una preferenza ma una conseguenza della viewport:
 * il drawer overlay resta identico a prima sotto i 1200px (dove funzionava
 * già), mentre sopra i 1200px la sidebar diventa una rail agganciata — sempre
 * visibile, collassata a icone di default, espandibile e persistita.
 *
 * Lo stato viene riflesso su `<html data-sidebar>` così che il layout globale
 * (offset di `main`/`app-footer` in styles.scss) possa reagire in CSS puro,
 * con lo stesso pattern già usato per `data-theme` e `data-os`.
 */
@Injectable({ providedIn: 'root' })
export class DrawerService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly wideViewport = signal(false);

  readonly mode = computed<SidebarMode>(() => (this.wideViewport() ? 'rail' : 'overlay'));

  /** Aperto/chiuso del drawer off-canvas. Significativo solo in modalità overlay. */
  readonly drawerOpen = signal(false);

  /** Rail espansa (icone + etichette) invece che collassata a sole icone. */
  readonly railExpanded = signal(false);

  /** True quando la rail è visibile ed espansa: usato per label, tooltip e offset. */
  readonly expanded = computed(() => this.mode() === 'rail' && this.railExpanded());

  constructor() {
    if (this.isBrowser) {
      this.railExpanded.set(this.readFlag(EXPANDED_KEY));

      // matchMedia invece di window:resize: notifica solo all'attraversamento
      // della soglia, senza un listener che gira a ogni pixel di ridimensionamento.
      const mq = window.matchMedia(`(min-width: ${RAIL_MIN_WIDTH}px)`);
      this.wideViewport.set(mq.matches);
      mq.addEventListener('change', event => {
        this.wideViewport.set(event.matches);
        // Passando a rail il drawer overlay non ha più senso: chiudilo, altrimenti
        // resterebbe un backdrop orfano sopra la pagina.
        if (event.matches) this.drawerOpen.set(false);
      });
    }

    effect(() => {
      if (!this.isBrowser) return;
      const state = this.mode() === 'rail' ? (this.railExpanded() ? 'rail-expanded' : 'rail') : 'overlay';
      this.document.documentElement.setAttribute('data-sidebar', state);
    });
  }

  /** Toggle "universale" usato dai trigger in navbar: apre il drawer o espande la rail. */
  toggle(): void {
    if (this.mode() === 'rail') {
      this.setRailExpanded(!this.railExpanded());
    } else {
      this.drawerOpen.update(v => !v);
    }
  }

  open(): void {
    if (this.mode() === 'rail') this.setRailExpanded(true);
    else this.drawerOpen.set(true);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  toggleRail(): void {
    this.setRailExpanded(!this.railExpanded());
  }

  private setRailExpanded(value: boolean): void {
    this.railExpanded.set(value);
    this.writeFlag(EXPANDED_KEY, value);
  }

  // localStorage è preferenza funzionale di UI (stessa classe del tema), non
  // tracciamento: non passa dal ConsentService. Wrappato perché in modalità
  // privata/storage disabilitato l'accesso può lanciare.
  private readFlag(key: string): boolean {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  private writeFlag(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* storage non disponibile: lo stato resta valido per la sessione corrente */
    }
  }
}
