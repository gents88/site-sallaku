import { stripLangPrefix } from '../../core/services/language.service';

/**
 * Rotte che mostrano la home portata a una sezione: /about → #about, anche con
 * il prefisso lingua (/en/about). Lo script inline in fondo a src/index.html ha
 * la stessa lista: jump-to-section.spec.ts le tiene allineate.
 */
export const SECTION_ROUTES = ['about', 'tech-stack', 'experience', 'skills', 'services'] as const;

/** Messo su <html> dallo script inline di index.html quando ha già posizionato la pagina. */
export const PRE_SCROLLED_ATTR = 'data-pre-scrolled';

/** Sezione della home da mostrare per questa URL, o null se la rotta non ne ha una. */
export function sectionForUrl(url: string): string | null {
  const { basePath } = stripLangPrefix(url.split(/[?#]/)[0]);
  const id = basePath.replace(/^\/+|\/+$/g, '');
  return (SECTION_ROUTES as readonly string[]).includes(id) ? id : null;
}

/**
 * true se lo script inline di index.html ha già portato in vista questa sezione
 * prima del primo paint (caricamento diretto di /about & co.). Vale una volta
 * sola: alle navigazioni interne successive il salto lo fa jumpToSection.
 */
export function consumePreScroll(doc: Document, id: string): boolean {
  const root = doc.documentElement;
  const done = root.getAttribute(PRE_SCROLLED_ATTR) === id;
  root.removeAttribute(PRE_SCROLLED_ATTR);
  return done;
}

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
