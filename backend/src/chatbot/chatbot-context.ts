import { LAB_CATALOG, LabCatalogEntry } from './lab-catalog';
import { topMatches } from './retrieval';

export interface ContextPost {
  title?: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
}

/** Descrizione accorciata a una parola intera (il prompt paga a token, ogni strumento ne usa ~30). */
function brief(text: string, max = 140): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,.;:\s]+$/, '') + '…';
}

const toSearchable = (e: LabCatalogEntry) => ({ title: `${e.name} ${e.altNames}`, body: `${e.description} ${e.altText}` });

/**
 * Parte del prompt sugli strumenti del Lab, generata dall'elenco reale (lab-catalog.ts, creato dal registro
 * di navigazione del sito): quando si aggiunge uno strumento basta rigenerarlo, il prompt non si riscrive.
 * Tutti gli strumenti principali stanno in una riga ciascuno; le pagine "scorciatoia" per ricerche
 * specifiche (heic-to-jpg, wifi-qr-code…) compaiono solo se pertinenti all'ultimo messaggio del visitatore.
 */
export function buildLabBlock(userMessage = '', catalog: readonly LabCatalogEntry[] = LAB_CATALOG): string {
  const tools = catalog.filter((e) => !e.shortcut && e.path !== '/lab' && e.description);
  const relevant = topMatches(userMessage, catalog.filter((e) => e.path !== '/lab'), toSearchable, 4);
  const serverSide = catalog.filter((e) => e.path === '/lab/convert' || e.parent === '/lab/convert').map((e) => e.path);

  const lines = [
    'Lab tools (all free, no sign-up). Use ONLY the exact paths listed here — never invent or guess a path:',
    ...tools.map((e) => `- ${e.name} (${e.path}): ${brief(e.description)}`),
  ];

  if (relevant.length) {
    lines.push(
      '',
      "Pages most relevant to the visitor's last message (a page marked 'preset' is the same tool already set up for that task — prefer sending the visitor straight to it):",
      ...relevant.map((e) => `- ${e.name} (${e.path})${e.shortcut && e.parent ? ` — preset of ${e.parent}` : ''}`),
    );
  }

  lines.push(
    '',
    'Privacy facts (state them accurately if asked):',
    `- These upload the file to the server to convert it: ${serverSide.join(', ')}.`,
    '- Signing, compressing PDFs, the photo tools (HEIC to JPG, resize, compress, WebP) and QR codes run locally in the browser: nothing is uploaded.',
    '',
    'Questions about a document: a visitor can ask an AI questions about a PDF with the "ask this document" box in /lab/viewer or /lab/pdf-summary, and keep documents in /lab/library. If someone wants to chat with, summarise or query a document, send them there instead of just describing it.',
    'When you recommend a tool, give its exact path so the visitor gets a clickable card. If you cannot name a matching tool from the list above, say so — do not make one up.',
  );
  return lines.join('\n');
}

/**
 * Articoli da citare nel prompt: i 3 più pertinenti all'ultimo messaggio fra TUTTI i pubblicati
 * (prima il bot conosceva solo gli 8 più recenti) più i più recenti fino a `max`.
 */
export function selectPostsForPrompt(all: readonly ContextPost[], userMessage: string, max = 8): ContextPost[] {
  const relevant = topMatches(
    userMessage,
    all,
    (p) => ({ title: `${p.title ?? ''} ${(p.tags ?? []).join(' ')}`, body: p.excerpt ?? '' }),
    3,
  );
  const seen = new Set(relevant.map((p) => p.slug));
  const recent = all.filter((p) => !seen.has(p.slug));
  return [...relevant, ...recent].slice(0, max);
}
