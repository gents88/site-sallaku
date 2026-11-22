import articles from './lab-articles.json';
import { NAV_REGISTRY, NavEntry } from '../../../core/navigation/nav-registry';
import { Lang } from '../../../core/services/language.service';

/** Articolo del blog collegato a uno strumento, con slug e titolo nella lingua richiesta. */
export interface LabArticleLink {
  /** Percorso senza prefisso lingua (`| langUrl` lo aggiunge): /blog/<slug-nella-lingua> */
  path: string;
  title: string;
}

interface LabToolRelations {
  /** Altri strumenti da suggerire (id del registro di navigazione) */
  tools: readonly string[];
  /** Articoli del blog che ne parlano (chiave = slug italiano) */
  articles: readonly string[];
}

/**
 * Collegamenti interni di ogni strumento: i link dagli strumenti agli articoli
 * (e viceversa dagli articoli, vedi blog-detail) sono tra i segnali più forti
 * per far capire a Google che pagine e articoli parlano dello stesso argomento.
 * Gli slug sono verificati contro public/sitemap.xml da lab-info.data.spec.ts.
 */
export const LAB_RELATIONS: Readonly<Record<string, LabToolRelations>> = {
  ocr: { tools: ['image-to-text', 'scanner', 'pdf-editor', 'convert', 'pdf-summary'], articles: ['ocr-online-estrarre-testo-da-scansioni-e-foto', 'scansionare-documenti-con-il-telefono-senza-scanner'] },
  scanner: { tools: ['ocr', 'pdf-editor', 'sign-pdf', 'compress-pdf', 'convert'], articles: ['scansionare-documenti-con-il-telefono-senza-scanner', 'ocr-online-estrarre-testo-da-scansioni-e-foto'] },
  'compress-pdf': { tools: ['pdf-editor', 'sign-pdf', 'viewer', 'convert'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online', 'pdf-accessibili-cosa-serve-davvero'] },
  'sign-pdf': { tools: ['pdf-editor', 'viewer', 'scanner', 'convert'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online', 'pdf-accessibili-cosa-serve-davvero'] },
  'pdf-editor': { tools: ['merge-pdf', 'split-pdf', 'rotate-pdf', 'sign-pdf', 'compress-pdf', 'viewer', 'convert'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online', 'pdf-accessibili-cosa-serve-davvero'] },
  viewer: { tools: ['pdf-editor', 'sign-pdf', 'ocr', 'pdf-summary'], articles: ['perche-la-ricerca-nel-pdf-non-trova-niente', 'pdf-accessibili-cosa-serve-davvero'] },
  editor: { tools: ['convert', 'ai-formatter', 'pdf-editor'], articles: ['scrivere-ed-esportare-documenti-pdf-docx-html-senza-word', 'come-convertire-pdf-in-word-senza-perdere-formattazione'] },
  convert: { tools: ['pdf-to-word', 'word-to-pdf', 'jpg-to-pdf', 'pdf-editor', 'ocr', 'editor'], articles: ['come-convertire-pdf-in-word-senza-perdere-formattazione', 'scrivere-ed-esportare-documenti-pdf-docx-html-senza-word'] },
  'pdf-summary': { tools: ['pdf-translate', 'ocr', 'ai-formatter'], articles: ['riassumere-pdf-con-ai-guida-pratica', 'intelligenza-artificiale-uso-quotidiano-casi-reali-e-limiti-da-conoscere'] },
  'pdf-translate': { tools: ['pdf-summary', 'ocr', 'convert'], articles: ['pdf-ai-translation-guide-2026', 'riassumere-pdf-con-ai-guida-pratica'] },
  'ai-ppt': { tools: ['ai-formatter', 'pdf-summary', 'editor'], articles: ['creare-presentazione-con-ai-quante-slide-e-quale-stile', 'intelligenza-artificiale-uso-quotidiano-casi-reali-e-limiti-da-conoscere'] },
  'ai-formatter': { tools: ['editor', 'ai-ppt', 'pdf-summary'], articles: ['intelligenza-artificiale-uso-quotidiano-casi-reali-e-limiti-da-conoscere', 'scrivere-ed-esportare-documenti-pdf-docx-html-senza-word'] },
  'pdf-to-word': { tools: ['word-to-pdf', 'ocr', 'editor', 'merge-pdf'], articles: ['come-convertire-pdf-in-word-senza-perdere-formattazione', 'scrivere-ed-esportare-documenti-pdf-docx-html-senza-word'] },
  'word-to-pdf': { tools: ['pdf-to-word', 'merge-pdf', 'jpg-to-pdf', 'editor'], articles: ['come-convertire-pdf-in-word-senza-perdere-formattazione', 'scrivere-ed-esportare-documenti-pdf-docx-html-senza-word'] },
  'jpg-to-pdf': { tools: ['merge-pdf', 'scanner', 'pdf-to-word', 'image-to-text'], articles: ['scansionare-documenti-con-il-telefono-senza-scanner', 'unire-dividere-ruotare-pdf-senza-caricarli-online'] },
  'merge-pdf': { tools: ['split-pdf', 'rotate-pdf', 'jpg-to-pdf', 'viewer'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online'] },
  'split-pdf': { tools: ['merge-pdf', 'rotate-pdf', 'pdf-to-word', 'viewer'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online', 'pdf-accessibili-cosa-serve-davvero'] },
  'rotate-pdf': { tools: ['merge-pdf', 'split-pdf', 'viewer', 'image-to-text'], articles: ['unire-dividere-ruotare-pdf-senza-caricarli-online'] },
  'image-to-text': { tools: ['scanner', 'pdf-to-word', 'pdf-summary', 'pdf-translate'], articles: ['ocr-online-estrarre-testo-da-scansioni-e-foto', 'scansionare-documenti-con-il-telefono-senza-scanner'] },
  'pdf-search': { tools: ['viewer', 'pdf-summary', 'ocr'], articles: ['come-trovare-scaricare-libri-pdf-gratis-legali'] },
};

type ArticleTable = Record<string, Partial<Record<Lang, { slug: string; title: string }>>>;
const ARTICLES = articles as ArticleTable;

/** Chiave i18n di uno strumento: l'id del registro con il trattino basso (pdf-editor → pdf_editor). */
export function labInfoKey(toolId: string): string {
  return toolId.replace(/-/g, '_');
}

export function relatedLabTools(toolId: string): NavEntry[] {
  return (LAB_RELATIONS[toolId]?.tools ?? [])
    .map(id => NAV_REGISTRY.find(e => e.id === id))
    .filter((e): e is NavEntry => !!e);
}

export function relatedLabArticles(toolId: string, lang: Lang): LabArticleLink[] {
  return (LAB_RELATIONS[toolId]?.articles ?? []).flatMap(it => {
    const entry = ARTICLES[it]?.[lang] ?? ARTICLES[it]?.['it'];
    return entry ? [{ path: `/blog/${entry.slug}`, title: entry.title }] : [];
  });
}

/** Tutti gli slug (in tutte le lingue) usati dai collegamenti: servono al test che li confronta con la sitemap. */
export function allLabArticleSlugs(): { lang: string; slug: string }[] {
  return Object.values(ARTICLES).flatMap(byLang =>
    Object.entries(byLang).map(([lang, v]) => ({ lang, slug: v!.slug })),
  );
}

/** Al massimo quanti pulsanti "Prova lo strumento" mostrare in fondo a un articolo. */
const MAX_ARTICLE_TOOLS = 3;

/** Strumenti (e pagine per ricerca specifica) collegati a un articolo, per il riquadro "Prova lo strumento". */
export function labToolsForArticle(italianSlug: string): NavEntry[] {
  return Object.entries(LAB_RELATIONS)
    .filter(([, r]) => r.articles.includes(italianSlug))
    .flatMap(([id]) => NAV_REGISTRY.filter(e => e.id === id))
    .slice(0, MAX_ARTICLE_TOOLS);
}
