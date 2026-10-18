import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREFETCH_INTENT_MS, RAIL_HINT_DELAY_MS, RAIL_HOVER_CLOSE_DELAY_MS, RAIL_HOVER_OPEN_DELAY_MS, SidebarComponent, isSidebarShortcut,
} from './sidebar.component';
import { RoutePrefetchService } from '../../../core/navigation/route-prefetch.service';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';
import { LanguageService } from '../../../core/services/language.service';

function pointer(type: 'pointerenter' | 'pointerleave', pointerType = 'mouse'): Event {
  const event = new MouseEvent(type);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

function setup(mode: 'rail' | 'overlay' = 'rail', pinned = false, admin = false) {
  const modeSig = signal<'rail' | 'overlay'>(mode);
  const railExpanded = signal(pinned);
  const hoverOpen = signal(false);
  const drawerOpen = signal(false);
  const drawer = {
    mode: modeSig,
    drawerOpen,
    railExpanded,
    hoverOpen,
    expanded: computed(() => modeSig() === 'rail' && (railExpanded() || hoverOpen())),
    close: vi.fn(),
    toggleRail: vi.fn(),
    // Come DrawerService.toggle(): overlay → drawer, rail → pin.
    toggle: vi.fn(() => (modeSig() === 'rail' ? railExpanded.update(v => !v) : drawerOpen.update(v => !v))),
    setHover: vi.fn((v: boolean) => hoverOpen.set(v && modeSig() === 'rail')),
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: signal(admin), isAdmin: signal(admin) } },
      { provide: DrawerService, useValue: drawer },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: AdminNotificationsService, useValue: { summary: signal({ contactsUnread: 2, followUpsDue: 1, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 }) } },
      { provide: LanguageService, useValue: { current: () => 'it' } },
      { provide: RoutePrefetchService, useValue: { prefetch: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(SidebarComponent);
  fixture.detectChanges();
  const prefetch = TestBed.inject(RoutePrefetchService).prefetch as ReturnType<typeof vi.fn>;
  const analytics = TestBed.inject(AnalyticsTrackingService) as unknown as { trackClick: ReturnType<typeof vi.fn> };
  const aside = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;
  return { fixture, aside, drawer, analytics, prefetch };
}

describe('SidebarComponent: apertura al passaggio del mouse', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('si apre dopo il breve ritardo quando il mouse entra', () => {
    const { aside, drawer } = setup();

    aside.dispatchEvent(pointer('pointerenter'));
    expect(drawer.setHover).not.toHaveBeenCalled();

    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS);
    expect(drawer.setHover).toHaveBeenCalledWith(true);
  });

  it('si chiude quando il mouse esce', () => {
    const { aside, drawer } = setup();
    aside.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS);

    aside.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(RAIL_HOVER_CLOSE_DELAY_MS);

    expect(drawer.setHover).toHaveBeenLastCalledWith(false);
  });

  it('un passaggio fugace non apre nulla (uscita prima del ritardo)', () => {
    const { aside, drawer } = setup();

    aside.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS - 10);
    aside.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(RAIL_HOVER_CLOSE_DELAY_MS);

    expect(drawer.setHover).not.toHaveBeenCalledWith(true);
  });

  it('rientrare prima della chiusura annulla la chiusura', () => {
    const { aside, drawer } = setup();
    aside.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS);

    aside.dispatchEvent(pointer('pointerleave'));
    vi.advanceTimersByTime(RAIL_HOVER_CLOSE_DELAY_MS - 20);
    aside.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(RAIL_HOVER_CLOSE_DELAY_MS + RAIL_HOVER_OPEN_DELAY_MS);

    expect(drawer.setHover).not.toHaveBeenCalledWith(false);
  });

  it('ignora tocco e penna: sugli schermi touch resta il pulsante', () => {
    const { aside, drawer } = setup();

    aside.dispatchEvent(pointer('pointerenter', 'touch'));
    aside.dispatchEvent(pointer('pointerenter', 'pen'));
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS * 3);

    expect(drawer.setHover).not.toHaveBeenCalled();
  });

  it('in modalità overlay (mobile/tablet) il passaggio non fa nulla', () => {
    const { aside, drawer } = setup('overlay');

    aside.dispatchEvent(pointer('pointerenter'));
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS * 3);

    expect(drawer.setHover).not.toHaveBeenCalled();
  });

  it('la classe hover-open c\'è solo se aperta dal mouse, non se agganciata', () => {
    const hovered = setup();
    hovered.drawer.setHover(true);
    hovered.fixture.detectChanges();
    expect(hovered.aside.classList.contains('hover-open')).toBe(true);
    expect(hovered.aside.classList.contains('expanded')).toBe(true);
  });

  it('agganciata: expanded ma senza hover-open', () => {
    TestBed.resetTestingModule();
    const pinned = setup('rail', true);
    expect(pinned.aside.classList.contains('expanded')).toBe(true);
    expect(pinned.aside.classList.contains('hover-open')).toBe(false);
  });

  it('Escape richiude subito e cancella i timer pendenti', () => {
    const { aside, drawer, fixture } = setup();
    aside.dispatchEvent(pointer('pointerenter'));

    fixture.componentInstance.onEscape();
    vi.advanceTimersByTime(RAIL_HOVER_OPEN_DELAY_MS * 3);

    expect(drawer.setHover).toHaveBeenCalledTimes(1);
    expect(drawer.setHover).toHaveBeenCalledWith(false);
  });
});

describe('SidebarComponent: drawer overlay chiuso fuori dalla tastiera', () => {
  it('è inert quando è chiuso, così Tab e screen reader non entrano nelle voci invisibili', () => {
    const { aside, drawer, fixture } = setup('overlay');
    expect(aside.inert).toBe(true);

    drawer.drawerOpen.set(true);
    fixture.detectChanges();
    expect(aside.inert).toBe(false);
  });

  it('all\'apertura sposta il focus sul pulsante di chiusura', async () => {
    const { aside, drawer, fixture } = setup('overlay');
    drawer.drawerOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(aside.querySelector('.close-btn'));
  });

  it('la rail resta sempre raggiungibile', () => {
    const { aside } = setup('rail');
    expect(aside.inert).toBe(false);
  });
});

describe('SidebarComponent: scheda della voce a rail aperta', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function hover(fixture: ReturnType<typeof setup>['fixture'], href: string): HTMLElement {
    const link = (fixture.nativeElement as HTMLElement).querySelector(`a.nav-item[href="${href}"]`) as HTMLElement;
    link.dispatchEvent(new MouseEvent('mouseenter'));
    return link;
  }

  function hint(fixture: ReturnType<typeof setup>['fixture']): HTMLElement | null {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.rail-hint');
  }

  it('compare solo quando il mouse si ferma sulla voce, con la descrizione dello strumento', () => {
    const { fixture } = setup('rail', true);
    hover(fixture, '/lab/library');

    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS - 10);
    expect(hint(fixture)).toBeNull();

    vi.advanceTimersByTime(10);
    expect(hint(fixture)?.textContent).toContain('sidebar.items.library');
    expect(hint(fixture)?.textContent).toContain('tools.library_desc');
  });

  it('non compare per le voci che non hanno niente da aggiungere all\'etichetta', () => {
    const { fixture } = setup('rail', true);
    hover(fixture, '/lab/i-miei-file');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).toBeNull();
  });

  it('per l\'admin elenca i contatori della voce', () => {
    const { fixture } = setup('rail', true, true);
    hover(fixture, '/dashboard/contacts');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    const items = Array.from(hint(fixture)?.querySelectorAll('.rail-hint__counts li') ?? []).map(li => li.textContent?.trim());
    expect(items).toEqual(['2 notifications.contacts_unread', '1 notifications.followups_due']);
  });

  it('sparisce uscendo dalla voce', () => {
    const { fixture } = setup('rail', true);
    const link = hover(fixture, '/lab/library');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).not.toBeNull();

    link.dispatchEvent(new MouseEvent('mouseleave'));
    expect(hint(fixture)).toBeNull();
  });

  it('sparisce quando la rail si richiude', () => {
    const { fixture, drawer } = setup('rail', true);
    hover(fixture, '/lab/library');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).not.toBeNull();

    drawer.railExpanded.set(false);
    expect(hint(fixture)).toBeNull();
  });

  it('un passaggio più breve del ritardo non lascia una scheda in arrivo', () => {
    const { fixture } = setup('rail', true);
    const link = hover(fixture, '/lab/library');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS / 2);
    link.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).toBeNull();
  });

  it('con la rail compressa che non si è espansa non compare (niente scheda sopra le icone)', () => {
    const { fixture } = setup('rail', false);
    hover(fixture, '/lab/library');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).toBeNull();
  });

  it('nel drawer overlay non compare mai', () => {
    const { fixture, drawer } = setup('overlay');
    drawer.drawerOpen.set(true);
    fixture.detectChanges();
    hover(fixture, '/lab/library');
    vi.advanceTimersByTime(RAIL_HINT_DELAY_MS);
    expect(hint(fixture)).toBeNull();
  });
});

function key(init: KeyboardEventInit, target?: Partial<HTMLElement>): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'b', cancelable: true, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('isSidebarShortcut', () => {
  it('riconosce Ctrl+B e ⌘B', () => {
    expect(isSidebarShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isSidebarShortcut(key({ metaKey: true }))).toBe(true);
    expect(isSidebarShortcut(key({ ctrlKey: true, key: 'B' }))).toBe(true);
  });

  it('ignora B senza modificatore e le combinazioni con Shift o Alt', () => {
    expect(isSidebarShortcut(key({}))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true, key: 'k' }))).toBe(false);
  });

  it('lascia Ctrl+B al grassetto nei campi e negli editor', () => {
    expect(isSidebarShortcut(key({ ctrlKey: true }, { tagName: 'TEXTAREA' }))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true }, { tagName: 'INPUT' }))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true }, { tagName: 'DIV', isContentEditable: true }))).toBe(false);
    expect(isSidebarShortcut(key({ ctrlKey: true }, { tagName: 'BUTTON' }))).toBe(true);
  });

  it('non interviene se il tasto è già stato gestito', () => {
    const event = key({ ctrlKey: true });
    event.preventDefault();
    expect(isSidebarShortcut(event)).toBe(false);
  });
});

describe('SidebarComponent: scorciatoia Ctrl+B', () => {
  it('nella rail aggancia e sgancia la colonna', () => {
    const { fixture, drawer, analytics } = setup('rail');
    const event = key({ ctrlKey: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(drawer.railExpanded()).toBe(true);
    expect(analytics.trackClick).toHaveBeenLastCalledWith('sidebar', 'sidebar_shortcut_expand');

    window.dispatchEvent(key({ metaKey: true }));
    fixture.detectChanges();
    expect(drawer.railExpanded()).toBe(false);
    expect(analytics.trackClick).toHaveBeenLastCalledWith('sidebar', 'sidebar_shortcut_collapse');
  });

  it('nell\'overlay apre il drawer e, richiudendolo, riporta il focus dove era', async () => {
    const { fixture, aside, drawer } = setup('overlay');
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    window.dispatchEvent(key({ ctrlKey: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(drawer.drawerOpen()).toBe(true);
    expect(document.activeElement).toBe(aside.querySelector('.close-btn'));

    window.dispatchEvent(key({ ctrlKey: true }));
    fixture.detectChanges();
    expect(drawer.drawerOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('mostra la scorciatoia nel title del pulsante', () => {
    const { aside } = setup('rail');
    const toggle = aside.querySelector('.rail-toggle') as HTMLElement;
    expect(toggle.getAttribute('title')).toMatch(/(Ctrl\+B|⌘B)$/);
    expect(toggle.getAttribute('aria-keyshortcuts')).toBe('Control+B Meta+B');
  });
});

describe('SidebarComponent: prefetch della pagina puntata', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function item(fixture: ReturnType<typeof setup>['fixture'], href: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector(`a.nav-item[href="${href}"]`) as HTMLElement;
  }

  it('parte quando il mouse resta sulla voce, non al primo sfioramento', () => {
    const { fixture, prefetch } = setup('rail', true);
    item(fixture, '/lab/ocr').dispatchEvent(new MouseEvent('mouseenter'));

    vi.advanceTimersByTime(PREFETCH_INTENT_MS - 1);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prefetch).toHaveBeenCalledWith('/lab/ocr');
  });

  it('scorrendo la lista col mouse non scarica le voci attraversate', () => {
    const { fixture, prefetch } = setup('rail', true);
    for (const href of ['/lab/ocr', '/lab/convert', '/lab/editor']) {
      const link = item(fixture, href);
      link.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(PREFETCH_INTENT_MS / 2);
      link.dispatchEvent(new MouseEvent('mouseleave'));
    }
    vi.advanceTimersByTime(PREFETCH_INTENT_MS);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('parte subito al focus da tastiera e alla pressione (anche al tocco)', () => {
    const { fixture, prefetch } = setup('overlay');
    item(fixture, '/lab/ocr').dispatchEvent(new FocusEvent('focus'));
    expect(prefetch).toHaveBeenLastCalledWith('/lab/ocr');

    item(fixture, '/lab/scanner').dispatchEvent(new MouseEvent('pointerdown'));
    expect(prefetch).toHaveBeenLastCalledWith('/lab/scanner');
  });
});
