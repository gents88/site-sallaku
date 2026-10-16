import { NAV_REGISTRY } from '../../core/navigation/nav-registry';
import { SUPPORTED_LANGS } from '../../core/services/language.service';

/**
 * Link interni citati in una risposta dell'assistente, mostrati come mini-card
 * sotto la bolla. Il backend fa citare all'assistente i path del sito
 * (/lab/pdf-summary, /blog/<slug>, …: vedi backend/src/chatbot/chatbot.service.ts),
 * quindi qui basta riconoscerli nel testo.
 *
 * `path` è sempre senza prefisso lingua: il template lo passa a `| langUrl`.
 */
export interface ChatLink {
  path: string;
  icon: string;
  /** Chiave i18n dell'etichetta (voci del registro di navigazione). */
  labelKey?: string;
  /** Etichetta già pronta (articoli e progetti, ricavata dallo slug). */
  label?: string;
  /** Chiave i18n del tipo, mostrata accanto all'etichetta per blog/progetti. */
  kindKey?: string;
}

const MAX_LINKS = 3;

const SECTIONS = 'lab|blog|projects|contact|services|testimonials|about|tech-stack|experience|skills';
const LANGS = SUPPORTED_LANGS.map((l) => l.code).join('|');

// Path del sito, anche come URL completo o con prefisso lingua (/en/lab/...).
// Delimitato da inizio/spazio/parentesi/virgolette prima e da punteggiatura dopo,
// così "/lab/ocr." o "(/blog/x)" funzionano e "a/b/lab" no.
const PATH_RE = new RegExp(
  String.raw`(?:^|[\s(\[«"'\`])(?:https?:\/\/(?:www\.)?gentsallaku\.it)?(?:\/(?:${LANGS}))?(\/(?:${SECTIONS})(?:\/[a-z0-9][a-z0-9-]*)?)\/?(?=$|[\s).,;:!?\]»"'\`])`,
  'gi',
);

const PUBLIC_ENTRIES = new Map(
  NAV_REGISTRY.filter((e) => e.access === 'public').map((e) => [e.route, e] as const),
);

/** "come-funziona-ocr" → "Come funziona ocr" */
function humanizeSlug(slug: string): string {
  const words = slug.replace(/-+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toLink(path: string): ChatLink | null {
  const entry = PUBLIC_ENTRIES.get(path);
  if (entry) return { path, icon: entry.icon, labelKey: entry.labelKey };

  const [, section, slug] = path.split('/');
  if (slug && section === 'blog') {
    return { path, icon: 'article', label: humanizeSlug(slug), kindKey: 'chatbot_ui.link_blog' };
  }
  if (slug && section === 'projects') {
    return { path, icon: 'grid', label: humanizeSlug(slug), kindKey: 'chatbot_ui.link_project' };
  }
  // Path che sembra del sito ma non esiste (es. un tool inventato): meglio
  // nessuna card che una card verso una 404.
  return null;
}

export function extractChatLinks(content: string): ChatLink[] {
  const links: ChatLink[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(PATH_RE)) {
    const path = match[1].toLowerCase();
    if (seen.has(path)) continue;
    seen.add(path);
    const link = toLink(path);
    if (link) links.push(link);
    if (links.length === MAX_LINKS) break;
  }
  return links;
}
