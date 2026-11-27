/**
 * Pulizia dell'HTML di un articolo prima di mostrarlo.
 *  - La pagina ha già il suo H1 (il titolo): un <h1> dentro il testo diventa <h2>, così ce n'è uno solo.
 *  - Un'immagine senza attributo alt riceve alt="" (decorativa) invece di restare senza.
 */
export function normalizeArticleHtml(html: string): string {
  if (!html) return html;
  return html
    .replace(/<h1(?=[\s>])/gi, '<h2')
    .replace(/<\/h1>/gi, '</h2>')
    .replace(/<img\b(?![^>]*\balt\s*=)([^>]*?)(\/?)>/gi, '<img alt=""$1$2>');
}
