import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { NavEntry, sidebarGroups } from '../../../core/navigation/nav-registry';
import { NavIconComponent, navIconColor } from '../nav-icon/nav-icon.component';

/** Tooltip della rail collassata: posizione calcolata dall'item sotto il puntatore/focus. */
interface RailTooltip {
  labelKey: string;
  top: number;
}

/** Ritardi dell'apertura al passaggio: evitano aperture/chiusure involontarie sfiorando il bordo. */
export const RAIL_HOVER_OPEN_DELAY_MS = 90;
export const RAIL_HOVER_CLOSE_DELAY_MS = 220;

/** Voce fittizia per il tracciamento del CTA "Esplora il Lab". */
const LAB_CTA = { route: '/lab' } as const;

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
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly mode = this.drawer.mode;
  readonly drawerOpen = this.drawer.drawerOpen;
  readonly expanded = this.drawer.expanded;
  /** Rail agganciata (pin) con il pulsante: sposta il contenuto invece di sovrapporsi. */
  readonly pinned = this.drawer.railExpanded;
  /** Aperta solo dal passaggio del mouse / tastiera: si sovrappone al contenuto. */
  readonly hoverOpen = computed(() => this.expanded() && !this.pinned());

  private pointerInside = false;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  readonly tooltip = signal<RailTooltip | null>(null);

  readonly isAdminUser = computed(() => this.auth.isLoggedIn() && this.auth.isAdmin());
  readonly brandLabelKey = computed(() => (this.isAdminUser() ? 'sidebar.brand_admin' : 'sidebar.brand_tools'));
  readonly brandBadge = computed(() => (this.isAdminUser() ? 'dashboard' : 'flask'));
  /** Voci dal registro unico (core/navigation): stesso elenco di palette, ricerca e prerender. */
  readonly navGroups = computed(() => sidebarGroups(this.isAdminUser()));
  readonly labCta = LAB_CTA;
  readonly iconColor = navIconColor;

  /** Numero di voci realmente esposte: alimenta il testo del nudge senza hardcodarlo. */
  readonly itemCount = computed(() => this.navGroups().reduce((total, group) => total + group.items.length, 0));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearHoverTimer());

    // All'apertura del drawer overlay il focus tastiera restava sul trigger dietro
    // il backdrop (quindi "sulla pagina"): lo sposta dentro il drawer, sul close-btn.
    // In modalità rail non c'è nessuna trappola di focus da gestire.
    effect(() => {
      if (this.mode() === 'overlay' && this.drawerOpen()) {
        this.elementRef.nativeElement.querySelector<HTMLElement>('.close-btn')?.focus();
      }
    });

    // La rail collassata non mostra etichette: se cambia stato mentre un tooltip
    // è visibile va scartato, altrimenti resta appeso sopra la colonna espansa.
    effect(() => {
      if (this.expanded() || this.mode() !== 'rail') this.tooltip.set(null);
    });
  }

  closeDrawer(): void {
    this.drawer.close();
  }

  toggleRail(): void {
    const next = !this.pinned();
    this.drawer.toggleRail();
    this.tooltip.set(null);
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

  showTooltip(event: Event, labelKey: string): void {
    if (this.mode() !== 'rail' || this.expanded()) return;
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    this.tooltip.set({ labelKey, top: rect.top + rect.height / 2 });
  }

  hideTooltip(): void {
    this.tooltip.set(null);
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    this.tooltip.set(null);
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
    this.tooltip.set(null);
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
