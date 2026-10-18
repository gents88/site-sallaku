import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initGlassSpotlight } from './glass-spotlight';

function fakeMatchMedia(matches: boolean): void {
  const noop = () => undefined;
  window.matchMedia = vi.fn().mockReturnValue({
    matches, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop,
  }) as unknown as typeof window.matchMedia;
}

function pointerMove(target: Element, x: number, y: number): void {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
  target.dispatchEvent(event);
}

describe('initGlassSpotlight', () => {
  let card: HTMLElement;
  let inner: HTMLElement;
  let outside: HTMLElement;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    document.body.innerHTML =
      '<div class="glass-card" id="card"><span id="inner">x</span></div><p id="outside">y</p>';
    card = document.getElementById('card') as HTMLElement;
    inner = document.getElementById('inner') as HTMLElement;
    outside = document.getElementById('outside') as HTMLElement;
    card.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  it('scrive --mx/--my relativi alla card, anche partendo da un figlio', () => {
    fakeMatchMedia(true);
    const stop = initGlassSpotlight(document);

    pointerMove(inner, 130, 90);

    expect(card.style.getPropertyValue('--mx')).toBe('30px');
    expect(card.style.getPropertyValue('--my')).toBe('40px');
    stop();
  });

  it('ignora il puntatore fuori da una .glass-card', () => {
    fakeMatchMedia(true);
    const stop = initGlassSpotlight(document);

    pointerMove(outside, 130, 90);

    expect(card.style.getPropertyValue('--mx')).toBe('');
    stop();
  });

  it('non registra nulla senza hover reale (touch)', () => {
    fakeMatchMedia(false);
    const spy = vi.spyOn(document, 'addEventListener');

    const stop = initGlassSpotlight(document);
    pointerMove(inner, 130, 90);

    expect(spy).not.toHaveBeenCalledWith('pointermove', expect.anything(), expect.anything());
    expect(card.style.getPropertyValue('--mx')).toBe('');
    stop();
    spy.mockRestore();
  });

  it('senza matchMedia (SSR/browser vecchi) non va in errore', () => {
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    expect(() => initGlassSpotlight(document)()).not.toThrow();
  });

  it('la funzione restituita rimuove il listener', () => {
    fakeMatchMedia(true);
    const stop = initGlassSpotlight(document);
    stop();

    pointerMove(inner, 130, 90);

    expect(card.style.getPropertyValue('--mx')).toBe('');
  });
});
