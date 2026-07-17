import {
  Injectable,
  BadRequestException,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as JSZip from 'jszip';

import { ConversionType } from './dto/convert.dto';
import { PdfConverter } from './converters/pdf.converter';
import { ImageConverter } from './converters/image.converter';
import { Base64Converter } from './converters/base64.converter';
import { DataConverter } from './converters/data.converter';

export interface ConversionResult {
  buffer?: Buffer;
  text?: string;
  json?: unknown;
  mimeType: string;
  filename: string;
  isStructured: boolean;
}

const ALLOWED_MIME_BY_CONVERSION: Partial<Record<ConversionType, string[]>> = {
  'pdf-to-docx': ['application/pdf'],
  'pdf-to-txt': ['application/pdf'],
  'pdf-to-html': ['application/pdf'],
  'pdf-to-json': ['application/pdf'],
  'pdf-to-csv': ['application/pdf'],
  'pdf-to-images': ['application/pdf'],
  'docx-to-pdf': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  'docx-to-txt': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  'docx-to-html': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ],
  'html-to-docx': ['text/html', 'text/plain', 'application/octet-stream'],
  'txt-to-pdf':  ['text/plain', 'application/octet-stream'],
  'txt-to-docx': ['text/plain', 'application/octet-stream'],
  'md-to-html':  ['text/plain', 'text/markdown', 'application/octet-stream'],
  'md-to-pdf':   ['text/plain', 'text/markdown', 'application/octet-stream'],
  'jpg-to-png': ['image/jpeg', 'image/jpg'],
  'png-to-jpg': ['image/png'],
  'png-to-webp': ['image/png', 'image/jpeg'],
  'webp-to-png': ['image/webp'],
  'image-to-pdf': ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  'merge-pdf': ['application/pdf'],
  'csv-to-excel': ['text/csv', 'text/plain', 'application/octet-stream'],
  'csv-to-json':  ['text/csv', 'text/plain', 'application/octet-stream'],
  'csv-to-pdf':   ['text/csv', 'text/plain', 'application/octet-stream'],
  'excel-to-csv':  [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  'excel-to-json': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  'excel-to-html': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
  'excel-to-pdf': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ],
};

@Injectable()
export class ConversionService {
  private readonly logger = new Logger(ConversionService.name);

  constructor(
    private readonly pdf: PdfConverter,
    private readonly image: ImageConverter,
    private readonly base64: Base64Converter,
    private readonly data: DataConverter,
  ) {}

  async convert(
    conversionType: ConversionType,
    inputType: 'file' | 'base64' | 'json',
    fileBuffers: Buffer[],
    fileMimes: string[],
    rawData?: string,
    options?: Record<string, unknown>,
  ): Promise<ConversionResult> {
    this.logger.log(`Converting: ${conversionType} | inputType: ${inputType}`);

    if (inputType === 'base64' && rawData) {
      const decoded = this.base64.decode(rawData);
      fileBuffers = [decoded.buffer];
      fileMimes = [decoded.mimeType];
    } else if (inputType === 'json' && rawData) {
      fileBuffers = [Buffer.from(rawData, 'utf-8')];
      fileMimes = ['application/json'];
    }

    if (fileBuffers.length === 0 && conversionType !== 'json-to-pdf') {
      throw new BadRequestException('No input data provided');
    }

    this.validateMimeCompatibility(conversionType, fileMimes);

    try {
      switch (conversionType) {
      case 'pdf-to-txt':
        return this.pdfToTxt(fileBuffers[0]);
      case 'pdf-to-html':
        return this.pdfToHtml(fileBuffers[0]);
      case 'pdf-to-json':
        return this.pdfToJson(fileBuffers[0]);
      case 'pdf-to-csv':
        return this.pdfToCsv(fileBuffers[0]);
      case 'pdf-to-docx':
        return this.pdfToDocx(fileBuffers[0]);
      case 'docx-to-pdf':
        return this.docxToPdf(fileBuffers[0]);
      case 'docx-to-txt':
        return this.docxToTxt(fileBuffers[0]);
      case 'docx-to-html':
        return this.docxToHtml(fileBuffers[0]);
      case 'html-to-pdf':
        return this.htmlToPdf(fileBuffers[0]);
      case 'html-to-docx':
        return this.htmlToDocx(fileBuffers[0]);
      case 'json-to-pdf':
        return this.jsonToPdf(rawData, fileBuffers[0]);
      case 'txt-to-pdf':
        return this.txtToPdf(fileBuffers[0]);
      case 'txt-to-docx':
        return this.txtToDocx(fileBuffers[0]);
      case 'md-to-html':
        return this.mdToHtml(fileBuffers[0]);
      case 'md-to-pdf':
        return this.mdToPdf(fileBuffers[0]);
      case 'merge-pdf':
        return this.mergePdf(fileBuffers);
      case 'jpg-to-png':
      case 'webp-to-png':
        return this.imageTo(fileBuffers[0], 'png');
      case 'png-to-jpg':
        return this.imageTo(fileBuffers[0], 'jpeg', options?.quality as number | undefined);
      case 'png-to-webp':
        return this.imageTo(fileBuffers[0], 'webp', options?.quality as number | undefined);
      case 'image-to-pdf':
        return this.imagesToPdf(fileBuffers, fileMimes);
      case 'pdf-to-images':
        return this.pdfToImages(fileBuffers[0]);
      case 'base64-to-png':
        return this.base64ToImage(rawData ?? fileBuffers[0].toString(), 'png');
      case 'base64-to-jpg':
        return this.base64ToImage(rawData ?? fileBuffers[0].toString(), 'jpeg');
      case 'base64-to-pdf':
        return this.base64ToPdf(rawData ?? fileBuffers[0].toString());
      case 'file-to-base64':
        return this.fileToBase64(fileBuffers[0], fileMimes[0]);
      case 'csv-to-excel':
        return this.csvToExcel(fileBuffers[0]);
      case 'csv-to-json':
        return this.csvToJson(fileBuffers[0]);
      case 'csv-to-pdf':
        return this.csvToPdf(fileBuffers[0]);
      case 'excel-to-csv':
        return this.excelToCsv(fileBuffers[0]);
      case 'excel-to-json':
        return this.excelToJson(fileBuffers[0]);
      case 'excel-to-html':
        return this.excelToHtml(fileBuffers[0]);
      case 'excel-to-pdf':
        return this.excelToPdf(fileBuffers[0]);
      case 'json-to-csv':
        return this.jsonToCsv(rawData, fileBuffers[0]);
      default:
        throw new BadRequestException(`Unsupported conversion: ${conversionType}`);
      }
    } catch (err: unknown) {
      if (err instanceof BadRequestException || err instanceof UnsupportedMediaTypeException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Conversion "${conversionType}" failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw new BadRequestException(`Conversion failed: ${msg}`);
    }
  }

  private async pdfToTxt(buf: Buffer): Promise<ConversionResult> {
    const text = await this.pdf.toText(buf);
    return { buffer: Buffer.from(text, 'utf-8'), mimeType: 'text/plain', filename: 'converted.txt', isStructured: false };
  }

  private async pdfToHtml(buf: Buffer): Promise<ConversionResult> {
    const html = await this.pdf.toHtml(buf);
    return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', filename: 'converted.html', isStructured: false };
  }

  private async pdfToJson(buf: Buffer): Promise<ConversionResult> {
    const json = await this.pdf.toJson(buf);
    return { json, mimeType: 'application/json', filename: 'converted.json', isStructured: true };
  }

  private async pdfToCsv(buf: Buffer): Promise<ConversionResult> {
    const csv = await this.pdf.toCsv(buf);
    return { buffer: Buffer.from(csv, 'utf-8'), mimeType: 'text/csv', filename: 'converted.csv', isStructured: false };
  }

  private async pdfToDocx(buf: Buffer): Promise<ConversionResult> {
    const text = await this.pdf.toText(buf);
    const { Document, Packer, Paragraph, TextRun } = await import('docx');
    const paragraphs = text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new Document({ sections: [{ children: paragraphs }] });
    const buffer = await Packer.toBuffer(doc);
    return {
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'converted.docx',
      isStructured: false,
    };
  }

  private async docxToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.docxToPdf(buf);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private async docxToTxt(buf: Buffer): Promise<ConversionResult> {
    const text = await this.data.docxToText(buf);
    return { buffer: Buffer.from(text, 'utf-8'), mimeType: 'text/plain', filename: 'converted.txt', isStructured: false };
  }

  private async docxToHtml(buf: Buffer): Promise<ConversionResult> {
    const html = await this.data.docxToHtml(buf);
    return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', filename: 'converted.html', isStructured: false };
  }

  private async htmlToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.htmlToPdf(buf.toString('utf-8'));
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private async htmlToDocx(buf: Buffer): Promise<ConversionResult> {
    const htmlToDocxFn = (await import('html-to-docx')).default;
    const out = await htmlToDocxFn(buf.toString('utf-8'), undefined, {
      orientation: 'portrait',
      title: 'document',
    });
    const docxBuf = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
    return {
      buffer: docxBuf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename: 'converted.docx',
      isStructured: false,
    };
  }

  private async jsonToPdf(rawData?: string, buf?: Buffer): Promise<ConversionResult> {
    let jsonData: unknown;
    if (rawData) { jsonData = this.data.parseJson(rawData); }
    else if (buf) { jsonData = this.data.parseJson(buf.toString('utf-8')); }
    else { throw new BadRequestException('No JSON data provided'); }
    const pdfBuf = await this.data.jsonToPdf(jsonData);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private async mergePdf(buffers: Buffer[]): Promise<ConversionResult> {
    if (buffers.length < 2) throw new BadRequestException('Need at least 2 PDF files to merge');
    const merged = await this.pdf.merge(buffers);
    return { buffer: merged, mimeType: 'application/pdf', filename: 'merged.pdf', isStructured: false };
  }

  private async imageTo(buf: Buffer, format: 'png' | 'jpeg' | 'webp', quality?: number): Promise<ConversionResult> {
    const converted = await this.image.convert(buf, format, quality);
    const ext = format === 'jpeg' ? 'jpg' : format;
    return { buffer: converted, mimeType: format === 'jpeg' ? 'image/jpeg' : `image/${format}`, filename: `converted.${ext}`, isStructured: false };
  }

  private async imagesToPdf(buffers: Buffer[], mimes: string[]): Promise<ConversionResult> {
    const pdfBuf = await this.pdf.imagesToPdf(buffers, mimes);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'images.pdf', isStructured: false };
  }

  private async pdfToImages(buf: Buffer): Promise<ConversionResult> {
    const pages = await this.pdf.toPageBuffers(buf);
    const zip = new JSZip();
    pages.forEach((page, i) => { zip.file(`page_${String(i + 1).padStart(3, '0')}.pdf`, page); });
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { buffer: zipBuf as Buffer, mimeType: 'application/zip', filename: 'pdf_pages.zip', isStructured: false };
  }

  private async base64ToImage(b64: string, format: 'png' | 'jpeg'): Promise<ConversionResult> {
    const { buffer } = this.base64.decode(b64);
    const converted = await this.image.convert(buffer, format);
    const ext = format === 'jpeg' ? 'jpg' : format;
    return { buffer: converted, mimeType: format === 'jpeg' ? 'image/jpeg' : `image/${format}`, filename: `converted.${ext}`, isStructured: false };
  }

  private async base64ToPdf(b64: string): Promise<ConversionResult> {
    const { buffer, mimeType } = this.base64.decode(b64);
    if (mimeType === 'application/pdf') {
      return { buffer, mimeType: 'application/pdf', filename: 'output.pdf', isStructured: false };
    }
    if (mimeType.startsWith('image/')) {
      return this.imagesToPdf([buffer], [mimeType]);
    }
    throw new BadRequestException(`Cannot convert MIME type "${mimeType}" to PDF via base64`);
  }

  private async fileToBase64(buf: Buffer, mime: string): Promise<ConversionResult> {
    const b64 = this.base64.encode(buf, mime);
    return { json: { base64: b64, mimeType: mime, size: buf.length }, mimeType: 'application/json', filename: 'output.json', isStructured: true };
  }

  private async txtToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.textToPdf(buf.toString('utf-8'));
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private async txtToDocx(buf: Buffer): Promise<ConversionResult> {
    const docxBuf = await this.data.txtToDocx(buf);
    return { buffer: docxBuf, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'converted.docx', isStructured: false };
  }

  private mdToHtml(buf: Buffer): ConversionResult {
    const html = this.data.mdToHtml(buf);
    return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', filename: 'converted.html', isStructured: false };
  }

  private async mdToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.mdToPdf(buf);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private csvToExcel(buf: Buffer): ConversionResult {
    const xlsxBuf = this.data.csvToExcel(buf);
    return { buffer: xlsxBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'converted.xlsx', isStructured: false };
  }

  private csvToJson(buf: Buffer): ConversionResult {
    const json = this.data.csvToJson(buf);
    return { json, mimeType: 'application/json', filename: 'converted.json', isStructured: true };
  }

  private async csvToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.csvToPdf(buf);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private excelToCsv(buf: Buffer): ConversionResult {
    const csv = this.data.excelToCsv(buf);
    return { buffer: Buffer.from(csv, 'utf-8'), mimeType: 'text/csv', filename: 'converted.csv', isStructured: false };
  }

  private excelToJson(buf: Buffer): ConversionResult {
    const json = this.data.excelToJson(buf);
    return { json, mimeType: 'application/json', filename: 'converted.json', isStructured: true };
  }

  private excelToHtml(buf: Buffer): ConversionResult {
    const html = this.data.excelToHtml(buf);
    return { buffer: Buffer.from(html, 'utf-8'), mimeType: 'text/html', filename: 'converted.html', isStructured: false };
  }

  private async excelToPdf(buf: Buffer): Promise<ConversionResult> {
    const pdfBuf = await this.data.excelToPdf(buf);
    return { buffer: pdfBuf, mimeType: 'application/pdf', filename: 'converted.pdf', isStructured: false };
  }

  private jsonToCsv(rawData?: string, buf?: Buffer): ConversionResult {
    let parsed: unknown;
    if (rawData) { parsed = this.data.parseJson(rawData); }
    else if (buf) { parsed = this.data.parseJson(buf.toString('utf-8')); }
    else { throw new BadRequestException('No JSON data provided'); }
    const csv = this.data.jsonToCsv(parsed);
    return { buffer: Buffer.from(csv, 'utf-8'), mimeType: 'text/csv', filename: 'converted.csv', isStructured: false };
  }

  private validateMimeCompatibility(type: ConversionType, mimes: string[]): void {
    const allowed = ALLOWED_MIME_BY_CONVERSION[type];
    if (!allowed || allowed.length === 0) return;
    for (const mime of mimes) {
      if (!allowed.some((a) => mime.startsWith(a) || a === mime)) {
        throw new UnsupportedMediaTypeException(
          `MIME type "${mime}" is not compatible with conversion "${type}". Allowed: ${allowed.join(', ')}`,
        );
      }
    }
  }
}
