export interface RelatedOptions<T> {
  id: (item: T) => string;
  tags: (item: T) => readonly string[] | null | undefined;
  /** A parità di tag in comune vince il valore più alto (es. timestamp di pubblicazione). */
  recency?: (item: T) => number;
}

/**
 * I `limit` contenuti più vicini a `current`: prima quelli con più tag in
 * comune (confronto senza maiuscole), a parità i più recenti. Se i tag in
 * comune non bastano si riempie con i più recenti, così in fondo alla
 * pagina c'è sempre un "prossimo passo".
 */
export function rankRelated<T>(current: T, candidates: readonly T[], opts: RelatedOptions<T>, limit = 3): T[] {
  const norm = (tags: readonly string[] | null | undefined) => new Set((tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean));
  const currentId = opts.id(current);
  const currentTags = norm(opts.tags(current));
  const recency = opts.recency ?? (() => 0);
  return candidates
    .filter(c => opts.id(c) !== currentId)
    .map((item, index) => ({
      item,
      index,
      shared: [...norm(opts.tags(item))].filter(t => currentTags.has(t)).length,
      recency: recency(item),
    }))
    .sort((a, b) => b.shared - a.shared || b.recency - a.recency || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(r => r.item);
}
