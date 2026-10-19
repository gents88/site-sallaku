/**
 * Contatori KPI dell'hero.
 *
 * I valori finali sono anche il valore INIZIALE del template: la pagina
 * prerenderizzata (e chi ha JavaScript disattivato o un crawler che non
 * esegue l'animazione) deve mostrare i numeri reali, non "0+ / 0+ / 0 / 0%".
 * L'animazione di conteggio parte da zero solo nel browser, e solo se
 * l'utente non ha chiesto di ridurre il movimento.
 */
export const HERO_KPI_TARGETS: readonly number[] = [8, 20, 4, 70];

/** Valori intermedi del conteggio: `progress` è 0..1, easing ease-out cubico. */
export function kpiCountUpValues(targets: readonly number[], progress: number): number[] {
  const p = Math.min(Math.max(progress, 0), 1);
  const ease = 1 - Math.pow(1 - p, 3);
  return targets.map(t => Math.floor(t * ease));
}

/** `prefers-reduced-motion: reduce`; false dove matchMedia non esiste (SSR, jsdom vecchi). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
