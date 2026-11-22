import { Injectable } from '@angular/core';

type PdfjsModule = typeof import('pdfjs-dist');
export type PdfDocument = import('pdfjs-dist').PDFDocumentProxy;
type PdfPage = import('pdfjs-dist').PDFPageProxy;

/**
 * Carica pdfjs-dist in modo lazy (solo browser, SSR-safe) e configura il worker
 * una sola volta. Usato da Viewer, OCR, PDF Editor e Scanner.
 */
@Injectable({ providedIn: 'root' })
export class PdfjsService {
  private mod: Promise<PdfjsModule> | null = null;

  load(): Promise<PdfjsModule> {
    if (!this.mod) {
      this.mod = import('pdfjs-dist').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        return pdfjs;
      });
    }
    return this.mod;
  }

  async openDocument(data: ArrayBuffer): Promise<PdfDocument> {
    const pdfjs = await this.load();
    return pdfjs.getDocument({ data }).promise;
  }

  /**
   * Estrae il testo pagina per pagina, per l'indicizzazione della Libreria.
   *
   * Restituisce una riga per ogni pagina anche quando è vuota: chi legge ha
   * bisogno del conteggio pagine reale per distinguere "documento senza testo"
   * (scansione) da "documento non ancora indicizzato".
   */
  async extractPages(
    doc: PdfDocument,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ page: number; text: string }[]> {
    const pages: { page: number; text: string }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push({ page: i, text });
      // La pagina resta in cache dentro pdf.js finché il documento è vivo: su un
      // libro da 800 pagine è memoria che non serve più una volta letto il testo.
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
    return pages;
  }

  /**
   * Rasterizza una pagina in PNG (Blob), a scala data.
   *
   * `maxPixels` limita l'area del canvas: le scansioni di libri hanno pagine
   * enormi e, moltiplicate per la scala, superano i limiti di Safari/Chrome
   * mobile (area massima ~16M px, e memoria ben prima) — il canvas risulta
   * allora completamente bianco senza alcun errore. Se la scala richiesta
   * sfora il tetto, si riduce quanto basta.
   *
   * Con `retryIfBlank`, un risultato interamente bianco viene rifatto a metà
   * risoluzione: è il sintomo tipico di un canvas troppo grande per il dispositivo.
   */
  async renderPageToBlob(page: PdfPage, scale = 2, opts: { maxPixels?: number; retryIfBlank?: boolean } = {}): Promise<Blob> {
    const base = page.getViewport({ scale: 1 });
    let effective = scale;
    if (opts.maxPixels) {
      const area = base.width * base.height * scale * scale;
      if (area > opts.maxPixels) effective = Math.sqrt(opts.maxPixels / (base.width * base.height));
    }

    let canvas = await this.renderToCanvas(page, effective);
    if (opts.retryIfBlank && this.isBlank(canvas) && effective > 0.5) {
      canvas = await this.renderToCanvas(page, effective / 2);
    }
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
    });
  }

  private async renderToCanvas(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    return canvas;
  }

  /** true se il canvas è tutto bianco o tutto trasparente (campionato su una miniatura, costa pochi ms). */
  private isBlank(canvas: HTMLCanvasElement): boolean {
    try {
      const probe = document.createElement('canvas');
      probe.width = 48;
      probe.height = 48;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(canvas, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      for (let i = 0; i < data.length; i += 4) {
        // un pixel non bianco e non trasparente = c'è contenuto
        if (data[i + 3] > 0 && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) return false;
      }
      return true;
    } catch {
      return false; // canvas "tainted" o non leggibile: nessuna ipotesi
    }
  }
}
