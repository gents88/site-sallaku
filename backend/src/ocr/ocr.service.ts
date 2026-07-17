import { Injectable, Logger, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import * as path from 'path';
import * as fs from 'fs';
// sharp ships as a CommonJS default export (`module.exports = fn`); a default/namespace
// TS import resolves inconsistently across module-resolution modes, so require it directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: (input?: Buffer | string) => import('sharp').Sharp = require('sharp');

export const OCR_LANGUAGES = ['eng', 'ita', 'spa', 'fra', 'deu', 'por', 'sqi'] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

export interface OcrPageResult {
  index: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  lang: string;
  pages: OcrPageResult[];
  text: string;
}

@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private readonly workers = new Map<string, Promise<Worker>>();
  private readonly cachePath = path.join(process.cwd(), '.tessdata');

  async onModuleDestroy(): Promise<void> {
    for (const workerPromise of this.workers.values()) {
      try {
        const worker = await workerPromise;
        await worker.terminate();
      } catch {
        /* already terminated */
      }
    }
    this.workers.clear();
  }

  async recognize(buffers: Buffer[], lang: string): Promise<OcrResult> {
    const normalizedLang = this.validateLang(lang);
    const worker = await this.getWorker(normalizedLang);

    const pages: OcrPageResult[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const png = await this.normalizeImage(buffers[i]);
      const { data } = await worker.recognize(png);
      pages.push({
        index: i,
        text: data.text.trim(),
        confidence: Math.round(data.confidence * 10) / 10,
      });
    }

    return {
      lang: normalizedLang,
      pages,
      text: pages.map((p) => p.text).filter(Boolean).join('\n\n'),
    };
  }

  /** Normalizza qualsiasi formato immagine (webp, tiff, exif-rotated…) in PNG per Tesseract. */
  private async normalizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).rotate().png().toBuffer();
    } catch {
      throw new BadRequestException('Invalid or unsupported image file');
    }
  }

  private validateLang(lang: string): string {
    const parts = (lang || 'eng')
      .split('+')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0 || parts.length > 3) {
      throw new BadRequestException('Invalid language selection');
    }
    for (const p of parts) {
      if (!OCR_LANGUAGES.includes(p as OcrLanguage)) {
        throw new BadRequestException(`Unsupported OCR language: ${p}`);
      }
    }
    return parts.join('+');
  }

  private getWorker(lang: string): Promise<Worker> {
    let workerPromise = this.workers.get(lang);
    if (!workerPromise) {
      fs.mkdirSync(this.cachePath, { recursive: true });
      this.logger.log(`Creating Tesseract worker for "${lang}"`);
      workerPromise = createWorker(lang, 1, { cachePath: this.cachePath }).catch((err) => {
        this.workers.delete(lang);
        throw err;
      });
      this.workers.set(lang, workerPromise);
    }
    return workerPromise;
  }
}
