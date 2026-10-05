export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

const HEADING_RE = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
const ID_ATTR_RE = /\bid\s*=\s*["']([^"']+)["']/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Testo leggibile di un titolo HTML: niente tag, entità decodificate, spazi compattati. */
export function headingText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** "Perché è più veloce?" → "perche-e-piu-veloce". Vuoto se non resta nulla di utile. */
export function slugifyHeading(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * Indice dell'articolo dai suoi h2/h3, nell'ordine del documento.
 *
 * Lavora sulla stringa (non sul DOM) così l'indice esce già nell'HTML
 * prerenderizzato. Gli id vengono poi applicati ai titoli veri nel browser,
 * per posizione: il sanitizer di Angular toglie l'attributo `id` da
 * [innerHTML], quindi non basta riscriverli nella stringa.
 */
export function extractToc(html: string | null | undefined): TocEntry[] {
  const used = new Map<string, number>();
  const entries: TocEntry[] = [];
  for (const match of (html ?? '').matchAll(HEADING_RE)) {
    const text = headingText(match[3]);
    if (!text) continue;
    const base = match[2].match(ID_ATTR_RE)?.[1] || slugifyHeading(text) || 'sezione';
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    entries.push({ id: seen ? `${base}-${seen + 1}` : base, text, level: Number(match[1]) as 2 | 3 });
  }
  return entries;
}

/**
 * Assegna gli id dell'indice ai titoli renderizzati in `container`, nello
 * stesso ordine (e saltando gli stessi titoli vuoti) di extractToc().
 * Restituisce gli elementi a cui è stato dato un id.
 */
export function applyHeadingIds(container: ParentNode, entries: readonly TocEntry[]): HTMLElement[] {
  const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3'))
    .filter(h => !!h.textContent?.trim());
  const applied: HTMLElement[] = [];
  headings.forEach((heading, i) => {
    const entry = entries[i];
    if (!entry) return;
    heading.id = entry.id;
    // Raggiungibile dal focus programmatico quando si clicca una voce dell'indice.
    heading.tabIndex = -1;
    applied.push(heading);
  });
  return applied;
}

/**
 * Aggiunge a ogni titolo un link "#" alla sezione (visibile al passaggio del
 * mouse o col focus). Idempotente: un titolo che ha già l'ancora viene saltato.
 */
export function addHeadingAnchors(headings: readonly HTMLElement[], label: string, onActivate: (id: string, event: MouseEvent) => void): void {
  for (const heading of headings) {
    if (!heading.id || heading.querySelector(':scope > .heading-anchor')) continue;
    const anchor = heading.ownerDocument.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${heading.id}`;
    anchor.textContent = '#';
    anchor.setAttribute('aria-label', `${label}: ${heading.textContent?.trim() ?? ''}`);
    anchor.addEventListener('click', event => onActivate(heading.id, event));
    heading.appendChild(anchor);
  }
}
