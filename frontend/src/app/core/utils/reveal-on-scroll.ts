/**
 * Aggiunge `.visible` agli elementi `.reveal` sotto `root` quando entrano in
 * viewport (animazione in styles.scss). Ritorna la funzione di pulizia.
 *
 * Senza IntersectionObserver (browser vecchi, test) gli elementi vengono
 * mostrati subito: `.reveal` parte da opacity 0 e non deve restare invisibile.
 */
export function revealOnScroll(root: ParentNode, threshold = 0.12): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('.reveal:not(.visible)'));
  if (typeof IntersectionObserver === 'undefined') {
    items.forEach(el => el.classList.add('visible'));
    return () => {};
  }
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold },
  );
  items.forEach(el => observer.observe(el));
  return () => observer.disconnect();
}
