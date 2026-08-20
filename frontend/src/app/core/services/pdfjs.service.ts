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

  /** Rasterizza una pagina in PNG (Blob), a scala data. */
  async renderPageToBlob(page: PdfPage, scale = 2): Promise<Blob> {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png');
    });
  }
}
