/**
 * Salto alla sezione indicata dalla rotta (/about → #about) subito dopo
 * l'hydration. Istantaneo e non animato: `html { scroll-behavior: smooth }`
 * (styles.scss) renderebbe animato anche `behavior: 'auto'`, e un'animazione di
 * ~1s sulla pagina più lunga del sito significa un layout per frame mentre il
 * browser sta ancora idratando, oltre a mostrare prima l'hero e solo dopo la
 * sezione richiesta.
 */
export function jumpToSection(doc: Document, id: string): void {
  doc.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
}
