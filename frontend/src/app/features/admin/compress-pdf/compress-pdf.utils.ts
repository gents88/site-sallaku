/**
 * Logica pura dello strumento "Comprimi PDF": livelli di compressione, calcolo delle dimensioni di
 * rasterizzazione, ricostruzione del PDF e confronto dei pesi. Niente DOM, così si testa senza browser.
 */

export type CompressMode = 'keep-text' | 'images';
export type CompressLevel = 'light' | 'medium' | 'strong';

export interface LevelSpec {
  /** Risoluzione di rasterizzazione, punti per pollice */
  dpi: number;
  /** Qualità JPEG, 0..1 */
  quality: number;
}

/**
 * Tre livelli. 150 dpi con qualità alta è ancora ottimo per leggere e stampare un documento;
 * 72 dpi è la risoluzione di uno schermo: leggibile, ma non per stampare.
 */
export const LEVELS: Readonly<Record<CompressLevel, LevelSpec>> = {
  light: { dpi: 150, quality: 0.82 },
  medium: { dpi: 110, quality: 0.68 },
  strong: { dpi: 72, quality: 0.5 },
};

/** Area massima (px) di una pagina rasterizzata: oltre, i canvas dei telefoni restituiscono bianco. */
export const MAX_PAGE_PIXELS = 8_000_000;

/** Le pagine di un PDF si misurano in punti (1/72 di pollice): la scala per ottenere `dpi` è dpi/72. */
export function scaleForDpi(dpi: number): number {
  return dpi / 72;
}

export interface RasterPage {
  /** JPEG */
  bytes: Uint8Array;
  /** Dimensione in pixel del bitmap */
  width: number;
  height: number;
  /** Dimensione della pagina in punti PDF: la nuova pagina avrà le stesse misure dell'originale */
  pageWidth: number;
  pageHeight: number;
}

/** Costruisce un PDF le cui pagine sono le immagini JPEG date, con le stesse misure di pagina dell'originale. */
export async function buildPdfFromJpegs(pages: readonly RasterPage[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const p of pages) {
    const img = await pdf.embedJpg(p.bytes);
    const page = pdf.addPage([p.pageWidth, p.pageHeight]);
    page.drawImage(img, { x: 0, y: 0, width: p.pageWidth, height: p.pageHeight });
  }
  pdf.setCreator('Gent Sallaku — Comprimi PDF');
  return pdf.save({ useObjectStreams: true });
}

/**
 * Ottimizzazione senza perdite: si rilegge e si risalva il PDF con gli oggetti raggruppati in
 * "object stream" e si tolgono i metadati ridondanti. Il testo resta selezionabile e le immagini
 * non vengono toccate: il risparmio c'è soprattutto sui PDF prodotti da generatori poco efficienti.
 */
export async function optimizePdf(source: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(source, { updateMetadata: false });
  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

/** Percentuale risparmiata, 0..100 (mai negativa: se il file non cala si parla di "nessun risparmio"). */
export function savedPercent(before: number, after: number): number {
  if (!before || after >= before) return 0;
  return Math.round(((before - after) / before) * 100);
}

/** Un risultato più grande (o quasi uguale) dell'originale non va proposto: meglio tenere il file di partenza. */
export function isWorthIt(before: number, after: number, minSavedPercent = 3): boolean {
  return savedPercent(before, after) >= minSavedPercent;
}

/**
 * Stima grezza: un PDF "di testo" (tanto testo estraibile per pagina) perde la selezionabilità se
 * rasterizzato. Serve a mostrare un avviso prima che l'utente scelga la modalità a immagini.
 */
export function looksTextBased(charsPerPage: readonly number[], minChars = 120): boolean {
  if (charsPerPage.length === 0) return false;
  const withText = charsPerPage.filter((c) => c >= minChars).length;
  return withText / charsPerPage.length >= 0.5;
}
