import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIL_HINT_DELAY_MS, RAIL_HOVER_CLOSE_DELAY_MS, RAIL_HOVER_OPEN_DELAY_MS, SidebarComponent } from './sidebar.component';
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
  const drawer = {
    mode: modeSig,
    drawerOpen: signal(false),
    railExpanded,
    hoverOpen,
    expanded: computed(() => modeSig() === 'rail' && (railExpanded() || hoverOpen())),
    close: vi.fn(),
    toggleRail: vi.fn(),
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
    ],
  });
  const fixture = TestBed.createComponent(SidebarComponent);
  fixture.detectChanges();
  const aside = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;
  return { fixture, aside, drawer };
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
