import { NAV_REGISTRY, NavEntry } from './nav-registry';
import type { WorkspaceItem } from '../services/workspace.service';

/** Cosa accetta in ingresso uno strumento del Lab (dal workspace o trascinando un file). */
interface LabToolInput {
  id: string;
  /** Testo puro dal workspace (es. il risultato dell'OCR). */
  text?: boolean;
  /** Estensioni di file accettate; '*' = qualsiasi file. */
  extensions?: readonly string[] | '*';
}

/**
 * Ordine = priorità del suggerimento. Allineato agli `accept` dei rispettivi
 * input file e ai controlli `pending.kind` sul workspace di ogni tool.
 */
const LAB_TOOL_INPUTS: readonly LabToolInput[] = [
  { id: 'pdf-summary', extensions: ['pdf', 'doc', 'docx', 'txt', 'html', 'htm'] },
  { id: 'pdf-translate', extensions: ['pdf', 'docx', 'txt'] },
  { id: 'ocr', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff'] },
  { id: 'ai-formatter', text: true },
  { id: 'pdf-editor', extensions: ['pdf'] },
  { id: 'viewer', extensions: ['pdf'] },
  { id: 'editor', text: true },
  { id: 'convert', extensions: '*' },
];

export type LabInput = { kind: 'text' } | { kind: 'file'; filename: string; mime?: string };

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'text/plain': 'txt',
  'text/html': 'html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
};

/** Ingresso equivalente a un elemento del workspace. */
export function workspaceInput(item: Pick<WorkspaceItem, 'kind' | 'filename' | 'mime'>): LabInput {
  return item.kind === 'text' ? { kind: 'text' } : { kind: 'file', filename: item.filename, mime: item.mime };
}

/** Estensione di un file, dal nome o in mancanza dal MIME type. */
export function fileExtension(filename: string, mime?: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot > 0 && dot < filename.length - 1) return filename.slice(dot + 1).toLowerCase();
  return (mime && MIME_EXTENSIONS[mime.toLowerCase()]) || '';
}

function entryFor(id: string): NavEntry | undefined {
  return NAV_REGISTRY.find(e => e.id === id);
}

/** Strumenti che possono aprire `input`, nell'ordine di suggerimento, escluso `exceptId`. */
export function labToolsAccepting(input: LabInput, exceptId?: string | null): NavEntry[] {
  const ext = input.kind === 'file' ? fileExtension(input.filename, input.mime) : '';
  return LAB_TOOL_INPUTS
    .filter(t => t.id !== exceptId)
    .filter(t => {
      if (input.kind === 'text') return !!t.text;
      if (t.extensions === '*') return true;
      return !!ext && !!t.extensions?.includes(ext);
    })
    .map(t => entryFor(t.id))
    .filter((e): e is NavEntry => !!e);
}

/** Id dello strumento del Lab per un URL (/lab/ocr, /en/lab/ocr?x=1…); null per /lab e il resto del sito. */
export function labToolIdForUrl(url: string): string | null {
  const match = url.match(/^\/(?:[a-z]{2}\/)?(lab\/[^/?#]+)/);
  if (!match) return null;
  return NAV_REGISTRY.find(e => e.route === `/${match[1]}`)?.id ?? null;
}

/** Voce di registro di uno strumento, per titolo/icona/rotta. */
export function labToolEntry(id: string): NavEntry | undefined {
  return entryFor(id);
}
