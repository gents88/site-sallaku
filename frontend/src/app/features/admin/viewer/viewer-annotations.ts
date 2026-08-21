import type { PDFPageProxy } from 'pdfjs-dist';
import type { LibraryAnnotation } from '../../../core/services/library.service';

/** Rettangolo in coordinate normalizzate 0..1 sulla pagina. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HIGHLIGHT_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f87171'] as const;

/**
 * Converte un trascinamento in pixel sul canvas in un rettangolo normalizzato.
 *
 * La normalizzazione è ciò che rende l'annotazione indipendente dallo zoom:
 * salvata a 100% resta al posto giusto riaperta a 250% o su un altro schermo.
 * Restituisce null per un trascinamento troppo piccolo, che è quasi sempre un
 * clic involontario e non una selezione.
 */
export function toNormRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  minSizePx = 6,
): NormRect | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) return null;
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < minSizePx || height < minSizePx) return null;

  // clamp: un trascinamento che esce dal canvas non deve produrre coordinate fuori pagina.
  const x = Math.max(0, Math.min(1, left / canvasWidth));
  const y = Math.max(0, Math.min(1, top / canvasHeight));
  return {
    x,
    y,
    w: Math.min(1 - x, width / canvasWidth),
    h: Math.min(1 - y, height / canvasHeight),
  };
}

/**
 * Ricava il testo del PDF coperto dal rettangolo.
 *
 * Un item di testo conta se il suo centro cade dentro la selezione: usare la
 * sovrapposizione parziale farebbe entrare mezze righe adiacenti a ogni
 * evidenziazione un po' generosa.
 */
export async function quoteFromRect(page: PDFPageProxy, rect: NormRect): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const parts: string[] = [];

  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const tx = item.transform;
    const [px, py] = viewport.convertToViewportPoint(tx[4], tx[5]);
    const height = Math.hypot(tx[2], tx[3]);
    const centerX = (px + item.width / 2) / viewport.width;
    // py è la base della riga: il centro verticale sta mezza altezza più su.
    const centerY = (py - height / 2) / viewport.height;

    if (
      centerX >= rect.x && centerX <= rect.x + rect.w &&
      centerY >= rect.y && centerY <= rect.y + rect.h
    ) {
      parts.push(item.str.trim());
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Esporta le annotazioni in Markdown, raggruppate per pagina. */
export function annotationsToMarkdown(title: string, annotations: LibraryAnnotation[]): string {
  const lines = [`# ${title}`, ''];
  let lastPage: number | null = null;

  for (const a of [...annotations].sort((x, y) => x.page - y.page || x.rect.y - y.rect.y)) {
    if (a.page !== lastPage) {
      lines.push(`## Pagina ${a.page}`, '');
      lastPage = a.page;
    }
    lines.push(a.quote ? `> ${a.quote}` : '> _(evidenziazione senza testo estraibile)_');
    if (a.note.trim()) lines.push('', a.note.trim());
    lines.push('');
  }

  return lines.join('\n');
}
