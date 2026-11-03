import { Logger } from '@nestjs/common';
import * as JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { ConversionService } from './conversion.service';
import { Base64Converter } from './converters/base64.converter';
import { DataConverter } from './converters/data.converter';
import { ImageConverter } from './converters/image.converter';
import { PdfConverter } from './converters/pdf.converter';

const HEAVY_LIBS = ['exceljs', 'mammoth', 'pdf-lib', 'jszip'];
/** PNG 1×1 trasparente. */
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString() === '%PDF-';
const pageCount = async (buf: Buffer) => (await PDFDocument.load(buf)).getPageCount();

describe('conversioni: librerie pesanti caricate al primo uso', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => jest.restoreAllMocks());

  it('importare il servizio e i convertitori non carica exceljs, mammoth, pdf-lib né jszip', () => {
    const loaded: string[] = [];
    jest.isolateModules(() => {
      for (const lib of HEAVY_LIBS) {
        jest.doMock(lib, () => {
          loaded.push(lib);
          return jest.requireActual(lib);
        });
      }
      require('./conversion.service');
      require('./converters/data.converter');
      require('./converters/pdf.converter');
    });
    for (const lib of HEAVY_LIBS) jest.dontMock(lib);
    expect(loaded).toEqual([]);
  });

  describe('DataConverter', () => {
    const data = new DataConverter();

    it('testo → PDF', async () => {
      const pdf = await data.textToPdf('Ciao\nmondo');
      expect(isPdf(pdf)).toBe(true);
      expect(await pageCount(pdf)).toBe(1);
    });

    it('pagine → PDF, una per voce e nella dimensione indicata', async () => {
      const pdf = await data.pagedTextToPdf([{ text: 'uno', width: 300, height: 400 }, { text: 'due' }]);
      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBe(2);
      expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    });

    it('JSON → PDF', async () => {
      expect(isPdf(await data.jsonToPdf({ nome: 'Gent', ruolo: 'sviluppatore' }))).toBe(true);
    });

    it('CSV → Excel → CSV e Excel → PDF', async () => {
      const xlsx = await data.csvToExcel(Buffer.from('nome,città\nGent,Milano'));
      expect(xlsx.subarray(0, 2).toString()).toBe('PK');
      const csv = await data.excelToCsv(xlsx);
      expect(csv.split('\n')).toEqual(['nome,città', 'Gent,Milano']);
      expect(isPdf(await data.excelToPdf(xlsx))).toBe(true);
    });

    it('testo → DOCX → testo e HTML (mammoth)', async () => {
      const docx = await data.txtToDocx(Buffer.from('Riga di prova'));
      expect((await data.docxToText(docx)).trim()).toBe('Riga di prova');
      expect(await data.docxToHtml(docx)).toContain('Riga di prova');
    });
  });

  describe('PdfConverter', () => {
    const pdf = new PdfConverter();

    it('unisce e poi divide i PDF', async () => {
      const a = await pdf.fromJson({ a: 1 });
      const b = await pdf.fromJson({ b: 2 });
      const merged = await pdf.merge([a, b]);
      expect(await pageCount(merged)).toBe(2);
      const pages = await pdf.toPageBuffers(merged);
      expect(pages).toHaveLength(2);
      expect(await pageCount(pages[1])).toBe(1);
    });

    it('immagini → PDF', async () => {
      const out = await pdf.imagesToPdf([TINY_PNG], ['image/png']);
      expect(await pageCount(out)).toBe(1);
    });
  });

  it('PDF → ZIP con un PDF per pagina (jszip)', async () => {
    const pdfConverter = new PdfConverter();
    const service = new ConversionService(pdfConverter, new ImageConverter(), new Base64Converter(), new DataConverter());
    const twoPages = await pdfConverter.merge([await pdfConverter.fromJson({ a: 1 }), await pdfConverter.fromJson({ b: 2 })]);

    const result = await service.convert('pdf-to-images', 'file', [twoPages], ['application/pdf']);

    expect(result.mimeType).toBe('application/zip');
    const zip = await JSZip.loadAsync(result.buffer!);
    expect(Object.keys(zip.files).sort()).toEqual(['page_001.pdf', 'page_002.pdf']);
  });
});
