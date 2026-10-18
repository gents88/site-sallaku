import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { NavEntry, NavGroupId, sidebarGroups } from '../../../core/navigation/nav-registry';
import { RoutePrefetchService } from '../../../core/navigation/route-prefetch.service';
import { NavIconComponent, navIconColor } from '../nav-icon/nav-icon.component';
import { NavBadge, badgeText, navBadges } from './nav-badges';

/**
 * Scheda accanto alla voce, a rail aperta: descrizione dello strumento e
 * dettaglio dei contatori. Sostituisce il vecchio tooltip della rail
 * compressa, che da quando la rail si apre al passaggio restava visibile
 * meno di 90ms (l'espansione lo cancellava): era solo uno sfarfallio.
 */
export interface RailHint {
  labelKey: string;
  descKey?: string;
  badge?: NavBadge;
  /** Centro verticale della voce, in coordinate viewport. */
  top: number;
}

/** Ritardi dell'apertura al passaggio: evitano aperture/chiusure involontarie sfiorando il bordo. */
export const RAIL_HOVER_OPEN_DELAY_MS = 90;
export const RAIL_HOVER_CLOSE_DELAY_MS = 220;
/** Il mouse deve fermarsi sulla voce: scorrendo l'elenco le schede non devono lampeggiare una dopo l'altra. */
export const RAIL_HINT_DELAY_MS = 450;
/**
 * Mouse sulla voce da almeno 80ms: chi ci passa sopra per scendere nella
 * lista non scarica ogni pagina che sfiora. Focus e pressione partono subito.
 */
export const PREFETCH_INTENT_MS = 80;

/** Voce fittizia per il tracciamento del CTA "Esplora il Lab". */
const LAB_CTA = { route: '/lab' } as const;

/**
 * Gruppi contati dal CTA "N strumenti disponibili": le stesse voci che la
 * pagina /lab mostra come strumenti. Contare tutti i gruppi faceva leggere
 * all'admin "24 strumenti", Dashboard, Contatti e Blog compresi.
 */
const LAB_TOOL_GROUPS: ReadonlySet<NavGroupId> = new Set<NavGroupId>(['ai', 'workspace', 'tools']);

/** Spazio lasciato attorno alla voce attiva quando la si porta in vista: la tiene fuori dalla sfumatura dei bordi. */
export const REVEAL_MARGIN_PX = 28;

export interface ScrollEdges {
  top: boolean;
  bottom: boolean;
}

/**
 * scrollTop che porta la voce [top, top + height] (coordinate del contenuto
 * scorrevole) dentro l'area visibile con un margine; null se è già visibile.
 */
export function revealScrollTop(scrollTop: number, viewHeight: number, top: number, height: number, margin = REVEAL_MARGIN_PX): number | null {
  let target = scrollTop;
  if (top - margin < scrollTop) target = Math.max(0, top - margin);
  else if (top + height + margin > scrollTop + viewHeight) target = top + height + margin - viewHeight;
  return target === scrollTop ? null : target;
}

/**
 * Ctrl+B / ⌘B apre e chiude il menu, come in VS Code. Non dentro un campo o
 * un editor, dove è il grassetto (editor di testo del Lab, editor del blog),
 * né se qualcun altro ha già gestito il tasto.
 */
export function isSidebarShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (event.key?.toLowerCase() !== 'b') return false;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable);
}

/** Movimento minimo prima di decidere se il dito sta scorrendo la lista o trascinando il drawer. */
export const SWIPE_SLOP_PX = 10;

/**
 * Fine del trascinamento verso sinistra del drawer: chiude se è andato oltre
 * un terzo della larghezza, o se è stato un colpo rapido (> 0,5 px/ms).
 * Altrimenti il drawer torna al suo posto.
 */
export function swipeCloses(dx: number, dtMs: number, width: number): boolean {
  if (dx >= 0) return false;
  const distance = -dx;
  return distance > width / 3 || (distance > 30 && distance / Math.max(dtMs, 1) > 0.5);
}

interface SwipeState {
  pointerId: number;
  x: number;
  y: number;
  t: number;
  dragging: boolean;
}

/** Su quali bordi c'è altro da scorrere (1px di tolleranza per gli arrotondamenti subpixel). */
export function scrollEdgesOf(scrollTop: number, scrollHeight: number, clientHeight: number): ScrollEdges {
  return { top: scrollTop > 1, bottom: scrollTop + clientHeight < scrollHeight - 1 };
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LangUrlPipe, TranslateModule, NavIconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);
  private readonly drawer = inject(DrawerService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly notifications = inject(AdminNotificationsService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly routePrefetch = inject(RoutePrefetchService);
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly mode = this.drawer.mode;
  readonly drawerOpen = this.drawer.drawerOpen;
  readonly expanded = this.drawer.expanded;
  /** Rail agganciata (pin) con il pulsante: sposta il contenuto invece di sovrapporsi. */
  readonly pinned = this.drawer.railExpanded;
  /** Aperta solo dal passaggio del mouse / tastiera: si sovrappone al contenuto. */
  readonly hoverOpen = computed(() => this.expanded() && !this.pinned());
  /**
   * Drawer overlay chiuso: è solo spostato fuori schermo, quindi senza `inert`
   * Tab attraversava 16 elementi invisibili (chiusura, voci, CTA) e gli screen
   * reader li leggevano. La rail invece è sempre visibile e resta raggiungibile.
   */
  readonly closedOffCanvas = computed(() => this.mode() === 'overlay' && !this.drawerOpen());

  private pointerInside = false;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private swipe: SwipeState | null = null;
  private suppressClick = false;
  /** Spostamento del drawer mentre il dito lo trascina (0 = a riposo). */
  readonly dragX = signal(0);

  /** Elemento col focus prima di aprire il drawer con la scorciatoia: lo si ritrova alla chiusura. */
  private returnFocus: HTMLElement | null = null;

  /** Scorciatoia mostrata nel title del pulsante: ⌘B su Apple, Ctrl+B altrove (stessa regola della palette). */
  readonly toggleShortcut =
    isPlatformBrowser(inject(PLATFORM_ID)) && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘B' : 'Ctrl+B';

  readonly hint = signal<RailHint | null>(null);

  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());
  readonly brandLabelKey = computed(() => (this.isAdminUser() ? 'sidebar.brand_admin' : 'sidebar.brand_tools'));
  readonly brandBadge = computed(() => (this.isAdminUser() ? 'dashboard' : 'flask'));
  /** Voci dal registro unico (core/navigation): stesso elenco di palette, ricerca e prerender. */
  readonly navGroups = computed(() => sidebarGroups(this.isAdminUser()));
  readonly labCta = LAB_CTA;
  readonly iconColor = navIconColor;

  /** Strumenti del Lab realmente esposti: alimenta il testo del CTA senza hardcodarlo. */
  readonly itemCount = computed(() =>
    this.navGroups()
      .filter(group => LAB_TOOL_GROUPS.has(group.id))
      .reduce((total, group) => total + group.items.length, 0),
  );

  /** Contatori del campanello sulle voci admin (per id del registro). */
  readonly badges = computed(() => (this.isAdminUser() ? navBadges(this.notifications.summary()) : {}));
  readonly badgeText = badgeText;

  /** Bordi della lista con altro contenuto da scorrere: accendono la sfumatura in CSS. */
  readonly scrollEdges = signal<ScrollEdges>({ top: false, bottom: false });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearHoverTimer();
      this.clearHintTimer();
      this.clearPrefetchTimer();
    });

    // La voce attiva va portata in vista: con 14+ voci la lista scorre (nella
    // rail compressa già a 1440×900) e aprendo /lab/scanner la voce evidenziata
    // restava sotto la piega, senza nessun segnale che la lista continuasse.
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        this.hideHint();
        this.afterRender(() => this.revealActive());
      });

    // Le voci cambiano col ruolo (login/logout admin): bordi e voce attiva vanno
    // ricalcolati sul nuovo elenco. Al primo giro copre anche il caricamento.
    effect(() => {
      this.navGroups();
      untracked(() => this.afterRender(() => this.revealActive()));
    });

    // Un trascinamento che finisce sopra una voce non è un tap: il click che
    // il browser potrebbe ancora generare non deve aprire quella pagina.
    afterNextRender(() => {
      const aside = this.elementRef.nativeElement.querySelector<HTMLElement>('#app-sidebar');
      if (!aside) return;
      const swallow = (event: Event) => {
        if (!this.suppressClick) return;
        this.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      };
      aside.addEventListener('click', swallow, true);
      this.destroyRef.onDestroy(() => aside.removeEventListener('click', swallow, true));
    });

    // Finestra ridimensionata, rail che si espande o si comprime, passaggio
    // overlay↔rail: cambia l'altezza visibile, quindi anche i bordi da sfumare.
    afterNextRender(() => {
      const nav = this.navElement();
      if (!nav || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.updateScrollEdges());
      observer.observe(nav);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    // All'apertura del drawer overlay il focus tastiera restava sul trigger dietro
    // il backdrop (quindi "sulla pagina"): lo sposta dentro il drawer, sul close-btn.
    // In modalità rail non c'è nessuna trappola di focus da gestire.
    // Dopo il render: prima il drawer è ancora `inert` e il focus verrebbe rifiutato.
    effect(() => {
      if (this.mode() === 'overlay' && this.drawerOpen()) {
        untracked(() => this.afterRender(() => this.elementRef.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus()));
      }
    });

    // La scheda vive solo accanto alla rail aperta: se la rail si richiude o si
    // passa all'overlay resterebbe appesa sopra il contenuto.
    effect(() => {
      if (!this.expanded() || this.mode() !== 'rail') untracked(() => this.hideHint());
    });
  }

  closeDrawer(): void {
    this.drawer.close();
  }

  /** La lista scorre sotto la scheda: la sua posizione non vale più. */
  onNavScroll(): void {
    this.hideHint();
    this.updateScrollEdges();
  }

  updateScrollEdges(): void {
    const nav = this.navElement();
    if (!nav) return;
    const next = scrollEdgesOf(nav.scrollTop, nav.scrollHeight, nav.clientHeight);
    const prev = this.scrollEdges();
    if (next.top !== prev.top || next.bottom !== prev.bottom) this.scrollEdges.set(next);
  }

  /**
   * Scorre solo la lista, a mano: scrollIntoView() farebbe scorrere anche gli
   * antenati, pagina compresa, pur essendo la sidebar position:fixed.
   */
  private revealActive(): void {
    const nav = this.navElement();
    const item = nav?.querySelector<HTMLElement>('.nav-item.active');
    if (nav && item) {
      const navTop = nav.getBoundingClientRect().top;
      const rect = item.getBoundingClientRect();
      const target = revealScrollTop(nav.scrollTop, nav.clientHeight, rect.top - navTop + nav.scrollTop, rect.height);
      if (target !== null) nav.scrollTop = target;
    }
    this.updateScrollEdges();
  }

  private navElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector<HTMLElement>('.sidebar-nav');
  }

  /** Dopo il prossimo render: routerLinkActive e le nuove voci devono essere già nel DOM. */
  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }

  toggleRail(): void {
    const next = !this.pinned();
    this.drawer.toggleRail();
    this.hideHint();
    this.analytics.trackClick('sidebar', next ? 'sidebar_rail_expand' : 'sidebar_rail_collapse');
  }

  /** Click su una voce: traccia la destinazione (per route, stabile a prescindere dalla lingua) e, in overlay, chiude il drawer. */
  onNavigate(item: Pick<NavEntry, 'route'>): void {
    this.analytics.trackClick(
      'sidebar_nav',
      `sidebar_${this.mode()}_${item.route.replace(/^\//, '').replace(/\//g, '_')}`,
      item.route,
    );
    if (this.mode() === 'overlay') this.drawer.close();
  }

  /** "+" accanto a Blog e Progetti: tracciato a parte dalla voce, poi come una navigazione normale. */
  onQuickAction(item: Pick<NavEntry, 'id' | 'route'>): void {
    this.analytics.trackClick('sidebar_nav', `sidebar_quick_${item.id.replace(/-/g, '_')}`, `${item.route}?new=1`);
    this.hideHint();
    if (this.mode() === 'overlay') this.drawer.close();
  }

  /** Solo mouse: un tocco su schermi touch grandi non deve aprire la rail (c'è il pulsante). */
  onPointerEnter(event: PointerEvent): void {
    if (this.mode() !== 'rail' || event.pointerType !== 'mouse') return;
    this.pointerInside = true;
    this.scheduleHover(true, RAIL_HOVER_OPEN_DELAY_MS);
  }

  onPointerLeave(event: PointerEvent): void {
    if (this.mode() !== 'rail' || event.pointerType !== 'mouse') return;
    this.pointerInside = false;
    this.scheduleHover(false, RAIL_HOVER_CLOSE_DELAY_MS);
  }

  /** Tastiera: raggiungere una voce con Tab apre la rail, così le etichette sono visibili. */
  onFocusIn(event: FocusEvent): void {
    if (this.mode() !== 'rail') return;
    const target = event.target as HTMLElement | null;
    if (!target?.matches?.(':focus-visible')) return;
    this.scheduleHover(true, 0);
  }

  private scheduleHover(open: boolean, delayMs: number): void {
    this.clearHoverTimer();
    if (delayMs === 0) {
      this.drawer.setHover(open);
      return;
    }
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      this.drawer.setHover(open);
    }, delayMs);
  }

  private clearHoverTimer(): void {
    if (this.hoverTimer !== null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  /**
   * Mouse fermo su una voce (o focus da tastiera): dopo RAIL_HINT_DELAY_MS
   * compare la scheda, ma solo se ha qualcosa da aggiungere all'etichetta,
   * cioè una descrizione o dei contatori. Nell'overlay non c'è passaggio del
   * mouse e la voce mostra già tutto.
   */
  onItemEnter(event: Event, item: NavEntry): void {
    this.schedulePrefetch(item, event.type === 'focus' ? 0 : PREFETCH_INTENT_MS);
    this.clearHintTimer();
    const target = event.currentTarget as HTMLElement | null;
    const badge = this.badges()[item.id];
    if (this.mode() !== 'rail' || !target || (!item.descKey && !badge)) {
      this.hint.set(null);
      return;
    }
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      // Nel frattempo la rail compressa si è espansa: la posizione va letta ora.
      if (!this.expanded()) return;
      const rect = target.getBoundingClientRect();
      this.hint.set({ labelKey: item.labelKey, descKey: item.descKey, badge, top: rect.top + rect.height / 2 });
    }, RAIL_HINT_DELAY_MS);
  }

  onItemLeave(): void {
    this.clearPrefetchTimer();
    this.hideHint();
  }

  /** Il codice della pagina parte prima del click: vedi RoutePrefetchService. */
  prefetch(item: Pick<NavEntry, 'route'>): void {
    this.clearPrefetchTimer();
    this.routePrefetch.prefetch(item.route);
  }

  private schedulePrefetch(item: Pick<NavEntry, 'route'>, delayMs: number): void {
    if (delayMs === 0) {
      this.prefetch(item);
      return;
    }
    this.clearPrefetchTimer();
    this.prefetchTimer = setTimeout(() => this.prefetch(item), delayMs);
  }

  private clearPrefetchTimer(): void {
    if (this.prefetchTimer !== null) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
  }

  hideHint(): void {
    this.clearHintTimer();
    if (this.hint() !== null) this.hint.set(null);
  }

  private clearHintTimer(): void {
    if (this.hintTimer !== null) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  /**
   * Swipe verso sinistra sul drawer aperto per chiuderlo, col drawer che segue
   * il dito. Niente swipe dal bordo per aprirlo: su iOS e con la navigazione a
   * gesti di Android quel gesto è "indietro" e rubarlo romperebbe la navigazione.
   */
  onSwipeStart(event: PointerEvent): void {
    if (this.mode() !== 'overlay' || !this.drawerOpen() || event.pointerType === 'mouse' || !event.isPrimary) return;
    this.swipe = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, dragging: false };
  }

  onSwipeMove(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe || event.pointerId !== swipe.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.dragging) {
      if (Math.abs(dx) < SWIPE_SLOP_PX && Math.abs(dy) < SWIPE_SLOP_PX) return;
      // Verticale: è lo scroll della lista (touch-action: pan-y), il drawer resta fermo.
      if (Math.abs(dy) >= Math.abs(dx) || dx > 0) {
        this.swipe = null;
        return;
      }
      swipe.dragging = true;
      this.hideHint();
    }
    this.dragX.set(Math.min(0, dx));
  }

  /** pointerup decide; pointercancel (il browser si è preso il gesto) riporta solo il drawer a posto. */
  onSwipeEnd(event: PointerEvent): void {
    const swipe = this.swipe;
    if (!swipe || event.pointerId !== swipe.pointerId) return;
    this.swipe = null;
    if (!swipe.dragging) return;
    const width = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect().width ?? 0;
    const close = event.type === 'pointerup' && swipeCloses(event.clientX - swipe.x, event.timeStamp - swipe.t, width);
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 400);
    this.dragX.set(0);
    if (close) {
      this.drawer.close();
      this.analytics.trackClick('sidebar', 'sidebar_swipe_close');
    }
  }

  @HostListener('window:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if (!isSidebarShortcut(event)) return;
    event.preventDefault();
    this.hideHint();
    const overlay = this.mode() === 'overlay';
    const closing = overlay && this.drawerOpen();
    if (overlay && !closing) this.returnFocus = this.elementRef.nativeElement.ownerDocument.activeElement as HTMLElement | null;
    this.drawer.toggle();
    // Il drawer chiuso diventa inert: il focus rimasto dentro andrebbe perso sul body.
    if (closing) {
      if (this.returnFocus?.isConnected) this.returnFocus.focus();
      this.returnFocus = null;
    }
    const opened = overlay ? !closing : this.pinned();
    this.analytics.trackClick('sidebar', opened ? 'sidebar_shortcut_expand' : 'sidebar_shortcut_collapse');
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.hideHint();
    this.clearHoverTimer();
    this.drawer.setHover(false);
    this.drawer.close();
  }

  // Chiude il drawer quando si clicca fuori (backdrop-less click-outside),
  // ignorando i toggle della navbar che gestiscono già l'apertura/chiusura:
  // .nav-drawer-toggle (trigger desktop/tablet) e .nav-item-mobile-drawer (voce
  // nel menu mobile) — senza questo, lo stesso click che apre il drawer da mobile
  // lo richiude subito in fase di bubbling su document.
  // In modalità rail non si applica: la colonna è parte del layout, non un overlay.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.mode() !== 'overlay' || !this.drawerOpen()) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (this.elementRef.nativeElement.contains(target)) return;
    if (target.closest('.nav-drawer-toggle, .nav-item-mobile-drawer')) return;
    this.drawer.close();
  }

  // Chiude il drawer overlay quando il focus (tastiera) ne esce.
  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    this.hideHint();
    // Rail: il focus esce dalla colonna e il mouse non c'è → richiudi.
    if (this.mode() === 'rail') {
      const next = event.relatedTarget as HTMLElement | null;
      if (!this.pointerInside && !(next && this.elementRef.nativeElement.contains(next))) {
        this.scheduleHover(false, RAIL_HOVER_CLOSE_DELAY_MS);
      }
      return;
    }
    if (this.mode() !== 'overlay' || !this.drawerOpen()) return;
    const nextFocus = event.relatedTarget as HTMLElement | null;
    if (nextFocus && this.elementRef.nativeElement.contains(nextFocus)) return;
    this.drawer.close();
  }
}
