import { Injectable } from '@angular/core';

export type PdfjsModule = typeof import('pdfjs-dist');
export type PdfDocument = import('pdfjs-dist').PDFDocumentProxy;
export type PdfPage = import('pdfjs-dist').PDFPageProxy;

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
