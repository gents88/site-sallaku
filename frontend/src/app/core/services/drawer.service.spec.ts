import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerService } from './drawer.service';

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
});
