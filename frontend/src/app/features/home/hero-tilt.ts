/**
 * Hero in 3D: lo schema architetturale a livelli e il contenuto dell'hero si
 * inclinano verso il puntatore, e un alone lo segue.
 *
 * Scrive SOLO il `transform` degli elementi che si muovono, dentro l'hero:
 *  - `[data-hero-tilt="<fattore>"]` → rotateX/rotateY, inclinazione × fattore
 *    (il testo usa 0.5, lo schema di più);
 *  - `[data-hero-glow]` → translate3d verso il puntatore.
 * Mai variabili CSS sull'hero: si ereditano su tutti i discendenti, e ogni
 * scrittura farebbe ricalcolare lo stile e ri-rasterizzare a ogni frame tutto
 * quello che usa gradienti (carta da progetto, nome, anello della foto) — misurato:
 * ~40 s di raster per 80 movimenti del mouse contro 0,3 s senza effetto.
 * `transform` invece non si eredita e su un layer composito non ridisegna.
 * Mentre il puntatore è sopra l'hero c'è la classe `is-tilting` (durate delle transizioni).
 *
 * Solo con mouse o penna su dispositivi con hover vero, e mai con
 * "riduci movimento": altrimenti non registra niente. Un aggiornamento per
 * frame al massimo; l'app è zoneless, quindi i listener non fanno partire il
 * change detection.
 *
 * Restituisce la funzione che rimuove i listener e rimette tutto dritto.
 */
export const HERO_TILT_MAX_DEG = 6;
export const HERO_TILT_CLASS = 'is-tilting';
export const HERO_TILT_SELECTOR = '[data-hero-tilt]';
export const HERO_GLOW_SELECTOR = '[data-hero-glow]';

const ENABLED_QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export interface HeroTilt {
  /** rotateX in gradi: positivo = la parte alta si allontana, l'hero "guarda" in alto. */
  rx: number;
  /** rotateY in gradi: positivo = la parte destra si allontana, l'hero "guarda" a destra. */
  ry: number;
  /** Distanza del puntatore dal centro dell'hero, in px (per l'alone). */
  px: number;
  py: number;
}

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
const round = (v: number): number => Math.round(v * 100) / 100;

/** Inclinazione per un puntatore in (clientX, clientY) sopra un hero grande `rect`. */
export function heroTiltFor(
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
  maxDeg = HERO_TILT_MAX_DEG,
): HeroTilt {
  if (rect.width <= 0 || rect.height <= 0) return { rx: 0, ry: 0, px: 0, py: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const nx = clamp((clientX - cx) / (rect.width / 2));
  const ny = clamp((clientY - cy) / (rect.height / 2));
  return {
    rx: round(-ny * maxDeg) || 0,
    ry: round(nx * maxDeg) || 0,
    px: Math.round(nx * (rect.width / 2)) || 0,
    py: Math.round(ny * (rect.height / 2)) || 0,
  };
}

/** Il `transform` di un elemento `[data-hero-tilt]` con quel fattore. */
export function tiltTransform(t: HeroTilt, factor: number): string {
  return `rotateX(${round(t.rx * factor) || 0}deg) rotateY(${round(t.ry * factor) || 0}deg)`;
}

/** Il `transform` dell'alone. */
export function glowTransform(t: HeroTilt): string {
  return `translate3d(${t.px}px, ${t.py}px, 0)`;
}

export function initHeroTilt(hero: HTMLElement): () => void {
  const win = hero.ownerDocument.defaultView;
  if (!win?.matchMedia?.(ENABLED_QUERY).matches) return () => undefined;

  const tilted = Array.from(hero.querySelectorAll<HTMLElement>(HERO_TILT_SELECTOR)).map(el => ({
    el,
    factor: Number(el.dataset['heroTilt']) || 1,
  }));
  const glows = Array.from(hero.querySelectorAll<HTMLElement>(HERO_GLOW_SELECTOR));
  if (!tilted.length && !glows.length) return () => undefined;

  let frame: number | null = null;
  let last: { x: number; y: number } | null = null;

  const apply = (t: HeroTilt): void => {
    tilted.forEach(({ el, factor }) => { el.style.transform = tiltTransform(t, factor); });
    glows.forEach(el => { el.style.transform = glowTransform(t); });
  };

  const cancelFrame = (): void => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
  };

  const isTouch = (event: Event): boolean => (event as PointerEvent).pointerType === 'touch';

  const onMove = (event: Event): void => {
    if (isTouch(event)) return;
    const { clientX, clientY } = event as PointerEvent;
    last = { x: clientX, y: clientY };
    if (!hero.classList.contains(HERO_TILT_CLASS)) hero.classList.add(HERO_TILT_CLASS);
    if (frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      if (last) apply(heroTiltFor(hero.getBoundingClientRect(), last.x, last.y));
    });
  };

  const onLeave = (event: Event): void => {
    if (isTouch(event)) return;
    cancelFrame();
    last = null;
    hero.classList.remove(HERO_TILT_CLASS);
    apply({ rx: 0, ry: 0, px: 0, py: 0 });
  };

  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave, { passive: true });

  return () => {
    hero.removeEventListener('pointermove', onMove);
    hero.removeEventListener('pointerleave', onLeave);
    cancelFrame();
    hero.classList.remove(HERO_TILT_CLASS);
    tilted.forEach(({ el }) => el.style.removeProperty('transform'));
    glows.forEach(el => el.style.removeProperty('transform'));
  };
}
