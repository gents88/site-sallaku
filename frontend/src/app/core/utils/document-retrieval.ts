import { tokenize } from '../services/library.service';

export interface DocPage {
  page: number;
  text: string;
}

export interface DocPassage {
  docTitle: string;
  page: number;
  text: string;
}

/** Il backend accetta al massimo 12 passaggi da 4000 caratteri; ne bastano pochi pertinenti. */
export const MAX_PASSAGES = 6;
export const MAX_PASSAGE_CHARS = 3500;
/** Lunghezza delle "pagine" ricavate da un testo senza pagine (txt/md). */
export const PLAIN_TEXT_CHUNK_CHARS = 2500;

const COMBINING_MARKS = /[̀-ͯ]/g;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}

/**
 * Le pagine più pertinenti alla domanda, in memoria. Stessa idea della ricerca
 * della Libreria (conteggio dei termini con saturazione logaritmica, premiando
 * le pagine che li contengono tutti) ma su un documento solo, senza IndexedDB:
 * qui il file non viene salvato da nessuna parte.
 */
export function rankPages(question: string, pages: DocPage[], limit = MAX_PASSAGES): DocPage[] {
  const terms = tokenize(question);
  if (terms.length === 0) return [];

  const scored: { page: DocPage; score: number }[] = [];
  for (const page of pages) {
    if (!page.text.trim()) continue;
    const haystack = normalize(page.text);
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      let count = 0;
      let pos = haystack.indexOf(term);
      while (pos !== -1) {
        count++;
        pos = haystack.indexOf(term, pos + term.length);
      }
      if (count > 0) {
        matched++;
        score += 1 + Math.log(count);
      }
    }
    if (matched > 0) scored.push({ page, score: (score * matched) / terms.length });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.page.page - b.page.page)
    .slice(0, limit)
    .map((s) => s.page);
}

/** Passaggi pronti per `/ai/ask-document`: testo tagliato al limite del DTO. */
export function toPassages(docTitle: string, pages: DocPage[]): DocPassage[] {
  return pages.map((p) => ({ docTitle: docTitle.slice(0, 300), page: p.page, text: p.text.slice(0, MAX_PASSAGE_CHARS) }));
}

/**
 * Spezza un testo senza pagine in blocchi numerati, preferendo i confini di
 * paragrafo o di frase a un taglio netto a metà parola.
 */
export function pagesFromPlainText(text: string, chunkChars = PLAIN_TEXT_CHUNK_CHARS): DocPage[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return [];
  const pages: DocPage[] = [];
  let rest = clean;
  while (rest.length > 0) {
    if (rest.length <= chunkChars) {
      pages.push({ page: pages.length + 1, text: rest.trim() });
      break;
    }
    const window = rest.slice(0, chunkChars);
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'));
    const end = cut > chunkChars * 0.5 ? cut + 1 : chunkChars;
    pages.push({ page: pages.length + 1, text: rest.slice(0, end).trim() });
    rest = rest.slice(end).trim();
  }
  return pages.filter((p) => p.text.length > 0);
}

/** Vero se nessuna pagina ha testo: tipico di una scansione senza livello testuale. */
export function hasNoText(pages: DocPage[]): boolean {
  return pages.every((p) => p.text.trim().length === 0);
}
