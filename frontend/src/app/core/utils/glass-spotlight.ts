/**
 * Riflesso che segue il puntatore sulle card in vetro.
 *
 * Un solo listener delegato sul documento: scrive --mx/--my (px, relativi alla
 * card) sulla `.glass-card` sotto il puntatore, e il CSS (vedi .glass-card in
 * styles.scss) li usa per un alone radiale acceso solo in hover. Sui
 * dispositivi senza hover reale (touch) non registra niente.
 *
 * Restituisce la funzione che rimuove il listener.
 */
export const GLASS_CARD_SELECTOR = '.glass-card';

export function initGlassSpotlight(doc: Document): () => void {
  const win = doc.defaultView;
  const hasHover = !!win?.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  if (!hasHover) return () => undefined;

  const onMove = (event: Event): void => {
    const { target, clientX, clientY } = event as PointerEvent;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>(GLASS_CARD_SELECTOR);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${clientX - rect.left}px`);
    card.style.setProperty('--my', `${clientY - rect.top}px`);
  };

  doc.addEventListener('pointermove', onMove, { passive: true });
  return () => doc.removeEventListener('pointermove', onMove);
}
