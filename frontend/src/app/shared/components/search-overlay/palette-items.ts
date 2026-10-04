export type PaletteSection = 'actions' | 'pages' | 'content';

export interface PaletteItem {
  id: string;
  section: PaletteSection;
  title: string;
  /** Riga secondaria: gruppo, descrizione o estratto. */
  detail?: string;
  /** Nome in NAV_ICONS. */
  icon: string;
  /** Destinazione (path logico senza prefisso lingua) oppure azione da eseguire. */
  url?: string;
  run?: () => void;
}

export const SECTION_ORDER: readonly PaletteSection[] = ['actions', 'pages', 'content'];

/**
 * Filtro locale (azioni + pagine): ogni parola della query deve comparire nel
 * titolo o nel dettaglio, così "nuovo art" trova "Nuovo articolo". Il titolo
 * che inizia con la query va in cima.
 */
export function filterLocal(items: readonly PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const words = q.split(/\s+/);
  return items
    .filter(item => {
      const hay = `${item.title} ${item.detail ?? ''}`.toLowerCase();
      return words.every(w => hay.includes(w));
    })
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)));
}

/** Unisce le sezioni nell'ordine fisso, togliendo i duplicati per destinazione. */
export function mergeSections(...lists: PaletteItem[][]): PaletteItem[] {
  const seen = new Set<string>();
  const all = lists.flat().filter(item => {
    const key = item.url ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return SECTION_ORDER.flatMap(section => all.filter(i => i.section === section));
}
