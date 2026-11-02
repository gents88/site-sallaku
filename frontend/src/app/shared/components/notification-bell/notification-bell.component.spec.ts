import { importProvidersFrom, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBellComponent, panelShift } from './notification-bell.component';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';

describe('panelShift', () => {
  const VW = 390;

  it('un pannello già dentro lo schermo non si sposta', () => {
    expect(panelShift(40, 360, VW)).toBe(0);
  });

  it('un pannello che sporge a sinistra viene spostato a destra fino al margine', () => {
    // Caso reale su telefono: bordo destro del campanello a 225, pannello da 320 px.
    expect(panelShift(-95, 225, VW)).toBe(107);
  });

  it('un pannello che sporge a destra viene spostato a sinistra', () => {
    expect(panelShift(100, 420, VW)).toBe(-42);
  });

  it('rispetta il margine: non resta incollato al bordo', () => {
    expect(panelShift(5, 325, VW)).toBe(7);
    expect(panelShift(12, 332, VW)).toBe(0);
  });

  it('un pannello più largo dello spazio disponibile si allinea a sinistra', () => {
    expect(panelShift(-30, 400, 320)).toBe(42);
  });

  it('il margine è configurabile', () => {
    expect(panelShift(0, 300, VW, 24)).toBe(24);
  });
});

describe('NotificationBellComponent — posizione del pannello', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let rect: { left: number; width: number };
  const realWidth = window.innerWidth;

  function setViewport(width: number): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setViewport(390);
    // Il test non fa layout: il pannello "misura" ciò che decide il test, tenendo conto dello spostamento già applicato.
    rect = { left: -95, width: 320 };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('nb-panel')) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
      const shift = Number(/translateX\((-?\d+)px\)/.exec(this.style.transform)?.[1] ?? 0);
      const left = rect.left + shift;
      return { left, right: left + rect.width, top: 0, bottom: 0, width: rect.width, height: 0, x: left, y: 0, toJSON: () => ({}) };
    });

    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        {
          provide: AdminNotificationsService,
          useValue: {
            summary: signal({ contactsUnread: 3, testimonialsPending: 1, notesPending: 0, liveHandoffsWaiting: 2, followUpsDue: 0 }),
            recent: signal([]),
            connected: signal(true),
            total: signal(6),
            refresh: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setViewport(realWidth);
    TestBed.resetTestingModule();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const panel = () => el().querySelector('.nb-panel') as HTMLElement | null;
  const openPanel = () => {
    (el().querySelector('.nb-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();
  };

  it('apre il pannello e aggiorna i contatori', () => {
    openPanel();

    expect(panel()).toBeTruthy();
    expect(fixture.componentInstance.notifications.refresh).toHaveBeenCalled();
  });

  it('su telefono sposta il pannello verso destra se sporge fuori dallo schermo', () => {
    openPanel();

    expect(fixture.componentInstance.shiftX()).toBe(107);
    expect(panel()!.style.transform).toBe('translateX(107px)');
  });

  it('se il pannello sta già nello schermo non applica nessuno spostamento', () => {
    rect = { left: 40, width: 320 };

    openPanel();

    expect(fixture.componentInstance.shiftX()).toBe(0);
    expect(panel()!.style.transform).toBe('');
  });

  it('chiudendo il pannello lo spostamento torna a zero', () => {
    openPanel();
    expect(fixture.componentInstance.shiftX()).not.toBe(0);

    fixture.componentInstance.close();

    expect(fixture.componentInstance.shiftX()).toBe(0);
  });

  it('riaprendo dopo la chiusura ricalcola da capo, senza accumulare spostamenti', () => {
    openPanel();
    fixture.componentInstance.close();
    fixture.detectChanges();

    openPanel();

    expect(fixture.componentInstance.shiftX()).toBe(107);
  });

  it('ruotando il telefono (resize) a pannello aperto lo riposiziona', () => {
    openPanel();
    setViewport(844);
    rect = { left: 400, width: 320 };

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(fixture.componentInstance.shiftX()).toBe(0);
  });

  it('un resize a pannello chiuso non fa nulla', () => {
    window.dispatchEvent(new Event('resize'));

    expect(fixture.componentInstance.shiftX()).toBe(0);
    expect(panel()).toBeNull();
  });

  it('Esc chiude il pannello', () => {
    openPanel();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(panel()).toBeNull();
  });
});
