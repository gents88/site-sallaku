import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PDFDocument, PageSizes, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';

const MAX_DOC_BYTES = 30 * 1024 * 1024;

@Injectable()
export class DataConverter {
  private readonly logger = new Logger(DataConverter.name);

  async docxToHtml(buffer: Buffer): Promise<string> {
    this.validateSize(buffer);
    const result = await mammoth.convertToHtml({ buffer });
    if (result.messages.length) {
      this.logger.warn('Mammoth warnings: ' + result.messages.map((m) => m.message).join('; '));
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Converted Document</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 2rem auto; line-height: 1.6; }
    h1,h2,h3 { margin-top: 1.5em; }
    p { margin-bottom: 0.8em; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
    td, th { border: 1px solid #ccc; padding: 6px 10px; }
  </style>
</head>
<body>
${result.value}
</body>
</html>`;
  }

  async docxToText(buffer: Buffer): Promise<string> {
    this.validateSize(buffer);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  async docxToPdf(buffer: Buffer): Promise<Buffer> {
    const text = await this.docxToText(buffer);
    return this.textToPdf(text);
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return this.textToPdf(text);
  }

  async textToPdf(text: string): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const lineHeight = fontSize + 5;
    const margin = 50;

    let page = pdfDoc.addPage(PageSizes.A4);
    let { width, height } = page.getSize();
    let y = height - margin;

    const maxWidth = width - margin * 2;

    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(' ');
      let line = '';

      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        const lineWidth = font.widthOfTextAtSize(candidate, fontSize);
        if (lineWidth > maxWidth && line) {
          if (y < margin + lineHeight) {
            page = pdfDoc.addPage(PageSizes.A4);
            ({ width, height } = page.getSize());
            y = height - margin;
          }
          page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
          y -= lineHeight;
          line = word;
        } else {
          line = candidate;
        }
      }

      if (line) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage(PageSizes.A4);
          ({ width, height } = page.getSize());
          y = height - margin;
        }
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }

      y -= lineHeight * 0.4;
    }

    return Buffer.from(await pdfDoc.save());
  }

  async jsonToPdf(jsonData: unknown): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Courier);
    const boldFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
    const fontSize = 9;
    const lineHeight = fontSize + 4;
    const margin = 50;

    let page = pdfDoc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();
    let y = height - margin;

    page.drawText('JSON Data', {
      x: margin,
      y,
      size: 14,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.8),
    });
    y -= lineHeight * 2.5;

    const json = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
    const lines = json.split('\n');

    for (const rawLine of lines) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage(PageSizes.A4);
        y = page.getSize().height - margin;
      }
      const display = rawLine.length > 110 ? rawLine.slice(0, 110) + '…' : rawLine;
      page.drawText(display, { x: margin, y, size: fontSize, font, color: rgb(0.05, 0.05, 0.05) });
      y -= lineHeight;
    }

    return Buffer.from(await pdfDoc.save());
  }

  parseJson(data: string): unknown {
    try {
      return JSON.parse(data);
    } catch {
      throw new BadRequestException('Invalid JSON: could not parse the provided data string');
    }
  }

  private validateSize(buf: Buffer): void {
    if (buf.length > MAX_DOC_BYTES) {
      throw new BadRequestException('Document exceeds 30 MB limit');
    }
  }

  private parseCsv(buffer: Buffer): string[][] {
    const text = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return text.split('\n').filter((r) => r.trim()).map((row) => {
      const fields: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { fields.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      fields.push(cur.trim());
      return fields;
    });
  }

  csvToExcel(buffer: Buffer): Buffer {
    this.validateSize(buffer);
    const rows = this.parseCsv(buffer);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(out);
  }

  excelToCsv(buffer: Buffer): string {
    this.validateSize(buffer);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('No sheets found in workbook');
    return XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
  }

  excelToJson(buffer: Buffer): unknown {
    this.validateSize(buffer);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const result: Record<string, unknown[]> = {};
    for (const sheetName of wb.SheetNames) {
      result[sheetName] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    }
    return result;
  }

  excelToHtml(buffer: Buffer): string {
    this.validateSize(buffer);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('No sheets found in workbook');
    const tableHtml = XLSX.utils.sheet_to_html(wb.Sheets[sheetName]);
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${sheetName}</title>
<style>
  body{font-family:Arial,sans-serif;padding:1.5rem}
  table{border-collapse:collapse;width:100%;font-size:13px}
  td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}
  th{background:#f0f0f0;font-weight:600}
  tr:nth-child(even){background:#fafafa}
</style></head><body><h2>${sheetName}</h2>${tableHtml}</body></html>`;
  }

  async excelToPdf(buffer: Buffer): Promise<Buffer> {
    this.validateSize(buffer);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new BadRequestException('No sheets found in workbook');
    const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 }) as string[][];
    return this.tableToPdf(sheetName, rows);
  }

  csvToJson(buffer: Buffer): unknown {
    this.validateSize(buffer);
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) return [];
    const headers = rows[0];
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h || `col${i}`] = row[i] ?? ''; });
      return obj;
    });
  }

  jsonToCsv(jsonData: unknown): string {
    const arr = Array.isArray(jsonData) ? jsonData : [jsonData];
    if (arr.length === 0) return '';
    const headers = Object.keys(arr[0] as Record<string, unknown>);
    const escape = (v: unknown) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };
    const rows = arr.map((row) =>
      headers.map((h) => escape((row as Record<string, unknown>)[h])).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  async csvToPdf(buffer: Buffer): Promise<Buffer> {
    this.validateSize(buffer);
    const rows = this.parseCsv(buffer);
    return this.tableToPdf('CSV Data', rows);
  }

  async txtToDocx(buffer: Buffer): Promise<Buffer> {
    this.validateSize(buffer);
    const text = buffer.toString('utf-8');
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const paragraphs = text.split('\n').map((line) =>
      new Paragraph({ children: [new TextRun(line)] }),
    );
    const doc = new Document({ sections: [{ children: paragraphs }] });
    return Packer.toBuffer(doc);
  }

  mdToHtml(buffer: Buffer): string {
    this.validateSize(buffer);
    const md = buffer.toString('utf-8');
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
      .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^---+$/gm, '<hr>')
      .replace(/^\s*[-*+] (.+)$/gm, '<li>$1</li>')
      .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n\n+/g, '</p><p>')
      .replace(/\n/g, '<br>');

    html = `<p>${html}</p>`;
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?:\s*<li>[\s\S]*?<\/li>)*/g, (m) => `<ul>${m}</ul>`);

    return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Document</title>
<style>
  body{font-family:Georgia,serif;max-width:860px;margin:2rem auto;line-height:1.75;color:#222;padding:0 1rem}
  h1,h2,h3,h4{margin-top:1.4em;color:#111}
  code{background:#f4f4f4;padding:2px 5px;border-radius:3px;font-size:0.9em}
  blockquote{border-left:4px solid #ccc;margin:0;padding-left:1rem;color:#555}
  img{max-width:100%}table{border-collapse:collapse;width:100%}
  td,th{border:1px solid #ccc;padding:6px 10px}
</style></head><body>${html}</body></html>`;
  }

  async mdToPdf(buffer: Buffer): Promise<Buffer> {
    const text = buffer.toString('utf-8')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*+]\s+/gm, '• ')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/^---+$/gm, '');
    return this.textToPdf(text);
  }

  private async tableToPdf(title: string, rows: string[][]): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const margin   = 30;
    const fontSize = 8;
    const cellPad  = 4;
    const rowH     = fontSize + cellPad * 2;

    let page = pdfDoc.addPage(PageSizes.A4);
    const pageW = page.getSize().width;
    const pageH = page.getSize().height;
    let y = pageH - margin - 20;

    page.drawText(title, { x: margin, y: y + 5, size: 13, font: boldFont, color: rgb(0.1, 0.1, 0.6) });
    y -= 25;

    if (!rows.length) {
      page.drawText('(empty)', { x: margin, y, size: 10, font, color: rgb(0.5, 0.5, 0.5) });
      return Buffer.from(await pdfDoc.save());
    }

    const colCount = Math.max(...rows.map((r) => r.length));
    const colW = (pageW - margin * 2) / Math.max(colCount, 1);

    for (let ri = 0; ri < rows.length; ri++) {
      if (y - rowH < margin) {
        page = pdfDoc.addPage(PageSizes.A4);
        y = page.getSize().height - margin;
      }

      const isHeader = ri === 0;
      page.drawRectangle({
        x: margin, y: y - rowH, width: pageW - margin * 2, height: rowH,
        color: isHeader ? rgb(0.22, 0.22, 0.55) : ri % 2 === 0 ? rgb(0.97, 0.97, 0.99) : rgb(1, 1, 1),
      });

      const row = rows[ri];
      for (let ci = 0; ci < colCount; ci++) {
        const cell = String(row[ci] ?? '');
        const maxChars = Math.floor((colW - cellPad * 2) / (fontSize * 0.55));
        const text = cell.length > maxChars ? cell.slice(0, maxChars - 1) + '…' : cell;
        page.drawText(text, {
          x: margin + ci * colW + cellPad,
          y: y - rowH + cellPad,
          size: fontSize,
          font: isHeader ? boldFont : font,
          color: isHeader ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1),
        });
        if (ci > 0) {
          page.drawLine({
            start: { x: margin + ci * colW, y: y },
            end:   { x: margin + ci * colW, y: y - rowH },
            thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
          });
        }
      }
      page.drawLine({
        start: { x: margin, y: y - rowH },
        end:   { x: pageW - margin, y: y - rowH },
        thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
      });

      y -= rowH;
    }

    return Buffer.from(await pdfDoc.save());
  }
}
