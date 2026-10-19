import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealOnScroll } from './reveal-on-scroll';

describe('revealOnScroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('senza IntersectionObserver mostra subito tutto (niente contenuto invisibile)', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    document.body.innerHTML = '<div class="reveal"></div><div class="reveal"></div>';

    revealOnScroll(document);

    expect(document.querySelectorAll('.reveal.visible')).toHaveLength(2);
  });

  it('mostra un elemento quando entra in viewport, smette di osservarlo e si pulisce', () => {
    let callback!: IntersectionObserverCallback;
    const observed: Element[] = [];
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { callback = cb; }
      observe(el: Element) { observed.push(el); }
      unobserve = unobserve;
      disconnect = disconnect;
    });
    document.body.innerHTML = '<div id="a" class="reveal"></div><div id="b" class="reveal"></div><div class="reveal visible"></div>';

    const stop = revealOnScroll(document);
    expect(observed.map(e => e.id)).toEqual(['a', 'b']);

    const a = document.getElementById('a')!;
    callback([{ isIntersecting: true, target: a } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(a.classList).toContain('visible');
    expect(document.getElementById('b')!.classList).not.toContain('visible');
    expect(unobserve).toHaveBeenCalledWith(a);

    stop();
    expect(disconnect).toHaveBeenCalled();
  });
});
