import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAIL_HOVER_CLOSE_DELAY_MS, RAIL_HOVER_OPEN_DELAY_MS, SidebarComponent } from './sidebar.component';
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

function setup(mode: 'rail' | 'overlay' = 'rail', pinned = false) {
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
      { provide: AuthService, useValue: { isLoggedIn: signal(false), isAdmin: signal(false) } },
      { provide: DrawerService, useValue: drawer },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: AdminNotificationsService, useValue: { summary: signal({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 }) } },
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
