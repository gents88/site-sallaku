import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HERO_TILT_CLASS,
  HERO_TILT_MAX_DEG,
  glowTransform,
  heroTiltFor,
  initHeroTilt,
  tiltTransform,
} from './hero-tilt';

const RECT = { left: 100, top: 50, width: 800, height: 400 };

describe('heroTiltFor', () => {
  it('al centro l\'hero resta dritto', () => {
    expect(heroTiltFor(RECT, 500, 250)).toEqual({ rx: 0, ry: 0, px: 0, py: 0 });
  });

  it('a destra guarda a destra, in alto guarda in alto, fino al massimo sui bordi', () => {
    expect(heroTiltFor(RECT, 900, 250)).toMatchObject({ ry: HERO_TILT_MAX_DEG, rx: 0, px: 400 });
    expect(heroTiltFor(RECT, 100, 250)).toMatchObject({ ry: -HERO_TILT_MAX_DEG, px: -400 });
    expect(heroTiltFor(RECT, 500, 50)).toMatchObject({ rx: HERO_TILT_MAX_DEG, ry: 0, py: -200 });
    expect(heroTiltFor(RECT, 500, 450)).toMatchObject({ rx: -HERO_TILT_MAX_DEG, py: 200 });
  });

  it('a metà strada l\'inclinazione è metà', () => {
    expect(heroTiltFor(RECT, 700, 150)).toEqual({ rx: 3, ry: 3, px: 200, py: -100 });
  });

  it('fuori dall\'hero non supera il massimo', () => {
    const t = heroTiltFor(RECT, 5000, -5000);
    expect(t.ry).toBe(HERO_TILT_MAX_DEG);
    expect(t.rx).toBe(HERO_TILT_MAX_DEG);
  });

  it('un hero senza dimensioni (non ancora disegnato) non produce NaN', () => {
    expect(heroTiltFor({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ rx: 0, ry: 0, px: 0, py: 0 });
  });
});

describe('tiltTransform / glowTransform', () => {
  it('moltiplica l\'inclinazione per il fattore dell\'elemento', () => {
    const t = { rx: 3, ry: -6, px: 0, py: 0 };
    expect(tiltTransform(t, 0.5)).toBe('rotateX(1.5deg) rotateY(-3deg)');
    expect(tiltTransform(t, 1.5)).toBe('rotateX(4.5deg) rotateY(-9deg)');
  });

  it('a riposo è dritto, senza "-0deg"', () => {
    expect(tiltTransform({ rx: -0, ry: 0, px: 0, py: 0 }, 1.5)).toBe('rotateX(0deg) rotateY(0deg)');
  });

  it('l\'alone si sposta dei px del puntatore dal centro', () => {
    expect(glowTransform({ rx: 0, ry: 0, px: 200, py: -100 })).toBe('translate3d(200px, -100px, 0)');
  });
});

describe('initHeroTilt', () => {
  let hero: HTMLElement;
  let content: HTMLElement;
  let arch: HTMLElement;
  let glow: HTMLElement;
  let frames: FrameRequestCallback[];
  const original = {
    matchMedia: window.matchMedia,
    raf: window.requestAnimationFrame,
    caf: window.cancelAnimationFrame,
  };

  function fakeMatchMedia(matches: boolean): ReturnType<typeof vi.fn> {
    const fn = vi.fn().mockReturnValue({ matches, addEventListener: () => undefined, removeEventListener: () => undefined });
    window.matchMedia = fn as unknown as typeof window.matchMedia;
    return fn;
  }

  function pointer(type: 'pointermove' | 'pointerleave', x = 0, y = 0, pointerType = 'mouse'): void {
    const event = new MouseEvent(type, { clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    hero.dispatchEvent(event);
  }

  function flushFrames(): void {
    const pending = frames;
    frames = [];
    pending.forEach(cb => cb(0));
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <section class="hero">
        <div class="hero-glow" data-hero-glow></div>
        <div class="hero-arch"><div class="hero-arch__tilt" data-hero-tilt="1.5"></div></div>
        <div class="hero-content" data-hero-tilt="0.5"><h1>Nome</h1></div>
      </section>`;
    hero = document.querySelector('.hero') as HTMLElement;
    content = document.querySelector('.hero-content') as HTMLElement;
    arch = document.querySelector('.hero-arch__tilt') as HTMLElement;
    glow = document.querySelector('.hero-glow') as HTMLElement;
    hero.getBoundingClientRect = () => RECT as DOMRect;
    frames = [];
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => frames.push(cb)) as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn((id: number) => { frames[id - 1] = () => undefined; }) as unknown as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.matchMedia = original.matchMedia;
    window.requestAnimationFrame = original.raf;
    window.cancelAnimationFrame = original.caf;
    document.body.innerHTML = '';
  });

  it('chiede hover vero, puntatore preciso e nessuna preferenza per il movimento ridotto', () => {
    const mm = fakeMatchMedia(true);
    initHeroTilt(hero)();
    const query = mm.mock.calls[0][0] as string;
    expect(query).toContain('(hover: hover)');
    expect(query).toContain('(pointer: fine)');
    expect(query).toContain('(prefers-reduced-motion: no-preference)');
  });

  it('col mouse inclina testo e schema ognuno col suo fattore e sposta l\'alone, una volta per frame', () => {
    fakeMatchMedia(true);
    const stop = initHeroTilt(hero);

    pointer('pointermove', 300, 100);
    pointer('pointermove', 700, 150);
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(true);
    expect(content.style.transform).toBe('');
    expect(frames).toHaveLength(1);

    flushFrames();
    expect(content.style.transform).toBe('rotateX(1.5deg) rotateY(1.5deg)');
    expect(arch.style.transform).toBe('rotateX(4.5deg) rotateY(4.5deg)');
    expect(glow.style.transform).toBe('translate3d(200px, -100px, 0)');
    stop();
  });

  it('non scrive mai stili sull\'hero né sui figli non animati (ri-rasterizzerebbero i gradienti a ogni frame)', () => {
    fakeMatchMedia(true);
    const stop = initHeroTilt(hero);
    for (const [x, y] of [[900, 50], [100, 450], [500, 250]]) {
      pointer('pointermove', x, y);
      flushFrames();
    }
    pointer('pointerleave');
    expect(hero.getAttribute('style')).toBeNull();
    expect(content.querySelector('h1')?.getAttribute('style')).toBeNull();
    expect(document.querySelector('.hero-arch')?.getAttribute('style')).toBeNull();
    stop();
  });

  it('quando il puntatore esce tutto torna dritto', () => {
    fakeMatchMedia(true);
    const stop = initHeroTilt(hero);
    pointer('pointermove', 900, 50);
    flushFrames();
    expect(content.style.transform).toBe('rotateX(3deg) rotateY(3deg)');

    pointer('pointermove', 100, 450);
    pointer('pointerleave');
    flushFrames();
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(false);
    expect(content.style.transform).toBe('rotateX(0deg) rotateY(0deg)');
    expect(arch.style.transform).toBe('rotateX(0deg) rotateY(0deg)');
    expect(glow.style.transform).toBe('translate3d(0px, 0px, 0)');
    stop();
  });

  it('ignora il tocco anche su un dispositivo ibrido', () => {
    fakeMatchMedia(true);
    const stop = initHeroTilt(hero);
    pointer('pointermove', 900, 50, 'touch');
    flushFrames();
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(false);
    expect(content.style.transform).toBe('');
    stop();
  });

  it('su touch o con "riduci movimento" non registra niente', () => {
    fakeMatchMedia(false);
    const stop = initHeroTilt(hero);
    pointer('pointermove', 900, 50);
    flushFrames();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(false);
    expect(content.style.transform).toBe('');
    expect(() => stop()).not.toThrow();
  });

  it('senza elementi da muovere non registra niente', () => {
    fakeMatchMedia(true);
    document.querySelectorAll('[data-hero-tilt], [data-hero-glow]').forEach(el => el.remove());
    const stop = initHeroTilt(hero);
    pointer('pointermove', 900, 50);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(false);
    stop();
  });

  it('senza matchMedia (vecchi browser) resta spento', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(() => initHeroTilt(hero)()).not.toThrow();
  });

  it('la pulizia toglie i listener, annulla il frame in attesa e i transform scritti', () => {
    fakeMatchMedia(true);
    const stop = initHeroTilt(hero);
    pointer('pointermove', 900, 50);
    flushFrames();
    pointer('pointermove', 100, 450);

    stop();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    flushFrames();
    expect(hero.classList.contains(HERO_TILT_CLASS)).toBe(false);
    expect(content.style.transform).toBe('');
    expect(arch.style.transform).toBe('');
    expect(glow.style.transform).toBe('');

    pointer('pointermove', 900, 50);
    flushFrames();
    expect(content.style.transform).toBe('');
  });
});
