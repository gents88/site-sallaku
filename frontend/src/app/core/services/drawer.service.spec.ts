import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerService, isToolAreaPath } from './drawer.service';

function stubViewport(wide: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  window.matchMedia = vi.fn().mockReturnValue({
    matches: wide,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }) as unknown as typeof window.matchMedia;
  return (matches: boolean) => listeners.forEach(cb => cb({ matches }));
}

describe('DrawerService: rail aperta al passaggio', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-sidebar');
  });
  afterEach(() => {
    window.matchMedia = original;
    localStorage.clear();
  });

  function create(wide = true) {
    const resize = stubViewport(wide);
    TestBed.resetTestingModule();
    const service = TestBed.inject(DrawerService);
    return { service, resize };
  }

  it('al passaggio la rail risulta espansa ma il layout non si sposta', () => {
    const { service } = create();

    service.setHover(true);
    TestBed.tick();

    expect(service.expanded()).toBe(true);
    expect(service.railExpanded()).toBe(false);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('rail');
  });

  it('togliendo il mouse si richiude', () => {
    const { service } = create();
    service.setHover(true);

    service.setHover(false);

    expect(service.expanded()).toBe(false);
  });

  it('il pin sposta il layout e resta aperto anche senza mouse', () => {
    const { service } = create();

    service.toggleRail();
    TestBed.tick();

    expect(service.expanded()).toBe(true);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('rail-expanded');
    expect(localStorage.getItem('gs-sidebar-pinned')).toBe('1');
  });

  it('ignora il vecchio valore "espansa" salvato prima di questa modifica', () => {
    localStorage.setItem('gs-sidebar-expanded', '1');

    const { service } = create();

    expect(service.railExpanded()).toBe(false);
  });

  it('sotto i 1200px (overlay) l\'hover non ha effetto', () => {
    const { service } = create(false);

    service.setHover(true);

    expect(service.hoverOpen()).toBe(false);
    expect(service.expanded()).toBe(false);
  });

  it('passando a overlay ridimensionando, l\'hover viene azzerato', () => {
    const { service, resize } = create(true);
    service.setHover(true);

    resize(false);

    expect(service.hoverOpen()).toBe(false);
  });

  it('fuori dalle pagine strumenti la rail lascia posto al drawer chiuso, senza spostare il layout', () => {
    const { service } = create(true);
    service.toggleRail();
    service.setHover(true);

    service.setRailAllowed(false);
    TestBed.tick();

    expect(service.mode()).toBe('overlay');
    expect(service.expanded()).toBe(false);
    expect(service.drawerOpen()).toBe(false);
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('overlay');
    // il pin resta salvato: tornando nel Lab la rail riparte agganciata
    service.setRailAllowed(true);
    TestBed.tick();
    expect(service.mode()).toBe('rail');
    expect(document.documentElement.getAttribute('data-sidebar')).toBe('rail-expanded');
  });

  it('chiude un drawer rimasto aperto quando si cambia area', () => {
    const { service } = create(false);
    service.toggle();
    expect(service.drawerOpen()).toBe(true);

    service.setRailAllowed(false);

    expect(service.drawerOpen()).toBe(false);
  });
});

describe('isToolAreaPath', () => {
  it('riconosce Lab e dashboard, con o senza sottopagina', () => {
    for (const path of ['/lab', '/lab/ocr', '/dashboard', '/dashboard/blog']) expect(isToolAreaPath(path)).toBe(true);
  });

  it('esclude le pagine del portfolio e i path che iniziano solo con le stesse lettere', () => {
    for (const path of ['/', '/homepage', '/about', '/blog/lab-notes', '/laboratorio', '/dashboards']) {
      expect(isToolAreaPath(path)).toBe(false);
    }
  });
});
