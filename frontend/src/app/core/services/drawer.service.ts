import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';

/**
 * `overlay` — drawer off-canvas sopra il contenuto, con backdrop (mobile/tablet).
 * `rail`    — colonna sempre visibile, collassata a icone (desktop). Si apre al
 *             passaggio del mouse sopra il contenuto, oppure resta agganciata
 *             (pin) e spinge il contenuto.
 */
export type SidebarMode = 'overlay' | 'rail';

/** Sotto questa soglia non c'è larghezza per una rail agganciata senza comprimere il contenuto. */
const RAIL_MIN_WIDTH = 1200;

/**
 * Pagine dove la sidebar serve davvero: gli strumenti del Lab e la dashboard.
 * Nel resto del sito (portfolio, blog, contatti) la rail con le 14 icone del
 * Lab competeva con il contenuto; lì resta solo come drawer da aprire a mano.
 * `path` senza prefisso lingua, query e fragment.
 */
export function isToolAreaPath(path: string): boolean {
  return /^\/(lab|dashboard)(\/|$)/.test(path);
}

// Chiave nuova (era 'gs-sidebar-expanded'): da quando la rail si apre al
// passaggio del mouse, un vecchio "espansa" salvato la terrebbe aperta per
// sempre. Il pin è una scelta esplicita e riparte da "non agganciata".
const PINNED_KEY = 'gs-sidebar-pinned';

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

  /**
   * La rail agganciata è ammessa nella pagina corrente (vedi isToolAreaPath).
   * La imposta AppComponent a ogni navigazione; vero di default così chi usa
   * il servizio da solo (test, altri host) ha il comportamento di sempre.
   */
  readonly railAllowed = signal(true);

  readonly mode = computed<SidebarMode>(() => (this.wideViewport() && this.railAllowed() ? 'rail' : 'overlay'));

  /** Aperto/chiuso del drawer off-canvas. Significativo solo in modalità overlay. */
  readonly drawerOpen = signal(false);

  /** Rail agganciata aperta (pin): spinge il contenuto e resta aperta senza mouse. */
  readonly railExpanded = signal(false);

  /**
   * Rail aperta temporaneamente da mouse o tastiera. Non sposta il contenuto:
   * si sovrappone, così il layout non "salta" a ogni passaggio del puntatore.
   */
  readonly hoverOpen = signal(false);

  /** True quando la rail mostra le etichette (agganciata o aperta al passaggio). */
  readonly expanded = computed(() => this.mode() === 'rail' && (this.railExpanded() || this.hoverOpen()));

  constructor() {
    if (this.isBrowser) {
      this.railExpanded.set(this.readFlag(PINNED_KEY));

      // matchMedia invece di window:resize: notifica solo all'attraversamento
      // della soglia, senza un listener che gira a ogni pixel di ridimensionamento.
      const mq = window.matchMedia(`(min-width: ${RAIL_MIN_WIDTH}px)`);
      this.wideViewport.set(mq.matches);
      mq.addEventListener('change', event => {
        this.wideViewport.set(event.matches);
        // Passando a rail il drawer overlay non ha più senso: chiudilo, altrimenti
        // resterebbe un backdrop orfano sopra la pagina.
        if (event.matches) this.drawerOpen.set(false);
        else this.hoverOpen.set(false);
      });
    }

    effect(() => {
      if (!this.isBrowser) return;
      // Solo il pin sposta il layout: l'apertura al passaggio sta sopra il contenuto.
      const state = this.mode() === 'rail' ? (this.railExpanded() ? 'rail-expanded' : 'rail') : 'overlay';
      this.document.documentElement.setAttribute('data-sidebar', state);
    });
  }

  /** Cambiando pagina: fuori dalle aree strumenti la rail lascia posto al drawer chiuso. */
  setRailAllowed(allowed: boolean): void {
    if (allowed === this.railAllowed()) return;
    this.railAllowed.set(allowed);
    this.hoverOpen.set(false);
    this.drawerOpen.set(false);
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

  /** Apre/chiude la rail al passaggio del mouse o al focus da tastiera. Solo in modalità rail. */
  setHover(value: boolean): void {
    this.hoverOpen.set(value && this.mode() === 'rail');
  }

  private setRailExpanded(value: boolean): void {
    this.railExpanded.set(value);
    this.writeFlag(PINNED_KEY, value);
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
