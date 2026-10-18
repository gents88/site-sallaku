import { TRANSLATED_BLOG_LANGUAGES } from './blog.constants';

export type TranslatedLang = (typeof TRANSLATED_BLOG_LANGUAGES)[number];

export type TranslationIssueKind = 'missing' | 'stale' | 'structure';

export interface TranslationIssue {
  lang: TranslatedLang;
  kind: TranslationIssueKind;
  /** structure: i tag con conteggi diversi dall'italiano, o 'length' se il testo è sproporzionato. */
  detail?: string[];
}

export interface PostTranslationHealth {
  _id: string;
  title: string;
  slug: string;
  published: boolean;
  issues: TranslationIssue[];
}

export interface TranslationHealthSummary {
  posts: number;
  postsWithIssues: number;
  missing: number;
  stale: number;
  structure: number;
  byLang: Record<TranslatedLang, { missing: number; stale: number; structure: number }>;
  /** I post con problemi: prima i pubblicati, poi per numero di problemi. */
  items: PostTranslationHealth[];
}

/**
 * Tag strutturali contati per confrontare una traduzione con l'italiano.
 * Sono gli stessi che il controllo manuale delle traduzioni verificava a mano:
 * Google Translate a volte perde o duplica blocchi interi (soprattutto <pre>
 * e tabelle in albanese) lasciando il resto apparentemente intatto.
 */
const STRUCTURE_TAGS = ['h2', 'h3', 'pre', 'table', 'tr', 'ul', 'ol', 'li', 'img', 'blockquote'] as const;

/** Sotto la metà o oltre il doppio dei caratteri dell'italiano: quasi certamente tronca o duplicata. */
const MIN_LENGTH_RATIO = 0.5;
const MAX_LENGTH_RATIO = 2;
/** Testi brevi (es. bozze di poche righe) non danno un rapporto affidabile. */
const MIN_LENGTH_FOR_RATIO = 400;

export function structureCounts(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tag of STRUCTURE_TAGS) {
    out[tag] = (html.match(new RegExp(`<${tag}(?=[\\s>/])`, 'gi')) ?? []).length;
  }
  return out;
}

function textLength(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

/** Tag con conteggi diversi, più 'length' se la lunghezza del testo è sproporzionata. */
export function structureDiff(source: string, target: string): string[] {
  const a = structureCounts(source);
  const b = structureCounts(target);
  const diff = STRUCTURE_TAGS.filter((t) => a[t] !== b[t]).map((t) => `${t} ${b[t]}/${a[t]}`);
  const srcLen = textLength(source);
  if (srcLen >= MIN_LENGTH_FOR_RATIO) {
    const ratio = textLength(target) / srcLen;
    if (ratio < MIN_LENGTH_RATIO || ratio > MAX_LENGTH_RATIO) diff.push('length');
  }
  return diff;
}

export interface PostForHealth {
  _id: unknown;
  title?: string;
  slug?: string;
  published?: boolean;
  content?: string;
  sourceUpdatedAt?: Date | string | null;
  translationsUpdatedAt?: Partial<Record<string, Date | string>> | null;
  [key: string]: unknown;
}

const time = (d: Date | string | null | undefined): number | null => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
};

export function analyzePost(post: PostForHealth): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  const source = post.content ?? '';
  const sourceAt = time(post.sourceUpdatedAt);

  for (const lang of TRANSLATED_BLOG_LANGUAGES) {
    const title = String(post[`title_${lang}`] ?? '').trim();
    const content = String(post[`content_${lang}`] ?? '').trim();
    if (!title || !content) {
      issues.push({ lang, kind: 'missing' });
      continue;
    }
    // Stale solo se si conoscono entrambe le date: i post salvati prima di
    // questo controllo non hanno date e non vanno segnalati a caso.
    const translatedAt = time(post.translationsUpdatedAt?.[lang]);
    if (sourceAt !== null && translatedAt !== null && translatedAt < sourceAt) {
      issues.push({ lang, kind: 'stale' });
    }
    const diff = structureDiff(source, content);
    if (diff.length) issues.push({ lang, kind: 'structure', detail: diff });
  }
  return issues;
}

/** Solo l'esito dell'analisi di un post, senza i corpi (che pesano). */
export function toPostHealth(post: PostForHealth): PostTranslationHealth {
  return {
    _id: String(post._id),
    title: post.title ?? '',
    slug: post.slug ?? '',
    published: !!post.published,
    issues: analyzePost(post),
  };
}

export function summarizeAnalyzed(analyzed: PostTranslationHealth[], limit = 20): TranslationHealthSummary {
  const byLang = Object.fromEntries(
    TRANSLATED_BLOG_LANGUAGES.map((l) => [l, { missing: 0, stale: 0, structure: 0 }]),
  ) as TranslationHealthSummary['byLang'];
  const totals = { missing: 0, stale: 0, structure: 0 };
  for (const post of analyzed) {
    for (const i of post.issues) {
      byLang[i.lang][i.kind]++;
      totals[i.kind]++;
    }
  }
  const items = analyzed
    .filter((p) => p.issues.length)
    .sort((a, b) => Number(b.published) - Number(a.published) || b.issues.length - a.issues.length);
  return { posts: analyzed.length, postsWithIssues: items.length, ...totals, byLang, items: items.slice(0, limit) };
}

export function summarizeTranslationHealth(posts: PostForHealth[], limit = 20): TranslationHealthSummary {
  return summarizeAnalyzed(posts.map(toPostHealth), limit);
}
