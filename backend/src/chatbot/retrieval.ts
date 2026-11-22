/**
 * Ricerca leggera per il chatbot: dato l'ultimo messaggio del visitatore, trova gli strumenti del Lab e
 * gli articoli del blog più pertinenti da inserire nel prompt. Niente indici esterni: punteggio per
 * parole in comune (con radice approssimata) su nome/titolo, descrizione, tag.
 *
 * Perché: il prompt conosceva solo gli 8 articoli più recenti e un elenco di strumenti scritto a mano.
 */

const STOPWORDS = new Set(
  (
    // it
    'il lo la le gli un una uno di del della dei delle da in con su per tra fra che chi come cosa quale quali dove quando perche perché non si ' +
    'sono posso puoi voglio vorrei fare fatto ho hai ha ci mi ti sul sulla sui nel nella nei nelle al alla ai alle anche ma o e ' +
    // en
    'the a an of to in on for with and or is are can how do does what which where when my your you i it this that be from at by ' +
    // es / pt / fr / de (le più frequenti)
    'el los las de la que como puedo para por con un una os as um uma pode eu le les des du de et est une pour sur avec ' +
    'der die das und ist ein eine mit für auf wie kann ich'
  ).split(/\s+/),
);

/** Minuscolo, senza accenti, con "wi-fi" → "wifi" (un trattino fra lettere è parte della parola). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(?<=\p{L})-(?=\p{L})/gu, '');
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Radice approssimata: le prime 5 lettere, così "firmare"/"firma", "comprimere"/"compressione" si incontrano. */
const stem = (t: string): string => (t.length > 5 ? t.slice(0, 5) : t);

export interface Searchable {
  /** Testo principale (nome strumento, titolo articolo): pesa di più. */
  title: string;
  /** Testo secondario (descrizione, estratto, tag). */
  body?: string;
}

export function scoreItem(queryTokens: string[], item: Searchable): number {
  if (!queryTokens.length) return 0;
  const titleStems = new Set(tokenize(item.title).map(stem));
  const bodyStems = new Set(tokenize(item.body ?? '').map(stem));
  let score = 0;
  for (const q of new Set(queryTokens.map(stem))) {
    if (titleStems.has(q)) score += 3;
    else if (bodyStems.has(q)) score += 1;
  }
  return score;
}

/** I `limit` elementi con punteggio > 0, dal più pertinente; a parità resta l'ordine originale. */
export function topMatches<T>(query: string, items: readonly T[], toSearchable: (item: T) => Searchable, limit: number): T[] {
  const tokens = tokenize(query);
  return items
    .map((item, index) => ({ item, index, score: scoreItem(tokens, toSearchable(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}
