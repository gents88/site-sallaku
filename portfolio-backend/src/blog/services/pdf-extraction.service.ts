import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

export interface ExtractedPdfDocument {
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  wordCount: number;
  rawText: string;
  preview: string;
  containsImages: boolean;
}

@Injectable()
export class PdfExtractionService {
  async extract(file: Express.Multer.File): Promise<ExtractedPdfDocument> {
    const parser = new PDFParse({ data: file.buffer });
    const parsed = await parser.getText();
    await parser.destroy();

    const rawText = this.normalizeText(parsed.text ?? '');

    if (!rawText || rawText.length < 80) {
      throw new BadRequestException('The PDF does not contain enough readable text to generate a post.');
    }

    return {
      fileName: file.originalname,
      sizeBytes: file.size,
      pageCount: parsed.pages.length,
      wordCount: rawText.split(/\s+/).filter(Boolean).length,
      rawText,
      preview: rawText.slice(0, 2000),
      containsImages: false,
    };
  }

  private normalizeText(value: string): string {
    return value
      .replace(/\u0000/g, ' ')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
  }
}