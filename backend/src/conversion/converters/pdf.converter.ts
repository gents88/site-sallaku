import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import pdfParse = require('pdf-parse');
import { PDFDocument, PageSizes, rgb } from 'pdf-lib';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

const PDFParse: any = (pdfParse as any).PDFParse;

@Injectable()
export class PdfConverter {
  private readonly logger = new Logger(PdfConverter.name);

  async toText(buffer: Buffer): Promise<string> {
    this.validateSize(buffer);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text as string;
  }

  async toHtml(buffer: Buffer): Promise<string> {
    const text = await this.toText(buffer);
    const escaped = this.escapeHtml(text);
    const paragraphs = escaped
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Converted Document</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; line-height: 1.6; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
${paragraphs}
</body>
</html>`;
  }

  async toJson(buffer: Buffer): Promise<object> {
    this.validateSize(buffer);
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    const pages: string[] = [];

    const rawLines = (data.text as string).split('\n');
    const totalLines = rawLines.length;
    const numPages: number = (data as any).total ?? 1;
    const linesPerPage = Math.ceil(totalLines / Math.max(numPages, 1));

    for (let i = 0; i < numPages; i++) {
      const start = i * linesPerPage;
      const pageText = rawLines.slice(start, start + linesPerPage).join('\n').trim();
      pages.push(pageText);
    }

    return {
      totalPages: numPages,
      pages: pages.map((text, idx) => ({ page: idx + 1, text })),
    };
  }

  async toCsv(buffer: Buffer): Promise<string> {
    const text = await this.toText(buffer);
    const rows: string[][] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const cells = trimmed.split(/\s{2,}/);
      if (cells.length >= 2) {
        rows.push(cells);
      } else {
        rows.push([trimmed]);
      }
    }

    return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  async imagesToPdf(imageBuffers: Buffer[], mimeTypes: string[]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < imageBuffers.length; i++) {
      const mime = mimeTypes[i] ?? 'image/jpeg';
      let img;
      try {
        if (mime === 'image/png') {
          img = await pdfDoc.embedPng(imageBuffers[i]);
        } else {
          img = await pdfDoc.embedJpg(imageBuffers[i]);
        }
      } catch {
        img = await pdfDoc.embedPng(imageBuffers[i]);
      }

      const page = pdfDoc.addPage(PageSizes.A4);
      const { width, height } = page.getSize();
      const scaled = img.scaleToFit(width - 40, height - 40);
      page.drawImage(img, {
        x: (width - scaled.width) / 2,
        y: (height - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
    }

    return Buffer.from(await pdfDoc.save());
  }

  async merge(buffers: Buffer[]): Promise<Buffer> {
    if (buffers.length === 0) throw new BadRequestException('No PDFs to merge');
    const merged = await PDFDocument.create();

    for (const buf of buffers) {
      this.validateSize(buf);
      const src = await PDFDocument.load(buf);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }

    return Buffer.from(await merged.save());
  }

  async toPageBuffers(buffer: Buffer): Promise<Buffer[]> {
    this.validateSize(buffer);
    const src = await PDFDocument.load(buffer);
    const results: Buffer[] = [];

    for (let i = 0; i < src.getPageCount(); i++) {
      const single = await PDFDocument.create();
      const [page] = await single.copyPages(src, [i]);
      single.addPage(page);
      results.push(Buffer.from(await single.save()));
    }

    return results;
  }

  async fromJson(data: unknown): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont('Helvetica' as any);

    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const lines = json.split('\n');
    const fontSize = 9;
    const lineHeight = fontSize + 4;
    let y = height - 40;
    const x = 40;
    const maxWidth = width - 80;

    for (const rawLine of lines) {
      if (y < 40) {
        const newPage = pdfDoc.addPage(PageSizes.A4);
        y = newPage.getSize().height - 40;
      }
      const display = rawLine.length > 100 ? rawLine.slice(0, 100) + '…' : rawLine;
      page.drawText(display, { x, y, size: fontSize, color: rgb(0.1, 0.1, 0.1), maxWidth });
      y -= lineHeight;
    }

    return Buffer.from(await pdfDoc.save());
  }

  private validateSize(buf: Buffer): void {
    if (buf.length > MAX_PDF_BYTES) {
      throw new BadRequestException('File exceeds 50 MB limit');
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
