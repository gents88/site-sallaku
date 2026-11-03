import { Injectable, Logger, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import * as path from 'path';
import * as fs from 'fs';
// sharp ships as a CommonJS default export (`module.exports = fn`); a default/namespace
// TS import resolves inconsistently across module-resolution modes, so require it directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: (input?: Buffer | string) => import('sharp').Sharp = require('sharp');

const OCR_LANGUAGES = ['eng', 'ita', 'spa', 'fra', 'deu', 'por', 'sqi'] as const;
type OcrLanguage = (typeof OCR_LANGUAGES)[number];

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

/**
 * Dopo quanto tempo senza richieste un worker viene chiuso. Ogni worker Tesseract
 * (WASM + dati della lingua) occupa ~75-85 MB, uno per combinazione di lingue: tenuti
 * in vita fino al riavvio, due o tre usi dell'OCR bastavano a portare il backend vicino
 * al limite di pm2 (max_memory_restart) su un server da 1,8 GB senza swap. Ricrearlo
 * costa ~1-2 s, con i dati della lingua già in .tessdata.
 */
export const OCR_WORKER_IDLE_MS = 2 * 60_000;

interface WorkerEntry {
  worker: Promise<Worker>;
  /** Richieste in corso: un worker che lavora non si chiude. */
  busy: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private readonly workers = new Map<string, WorkerEntry>();
  private readonly cachePath = path.join(process.cwd(), '.tessdata');

  async onModuleDestroy(): Promise<void> {
    const entries = [...this.workers.values()];
    this.workers.clear();
    for (const entry of entries) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      await this.terminate(entry);
    }
  }

  async recognize(buffers: Buffer[], lang: string): Promise<OcrResult> {
    const normalizedLang = this.validateLang(lang);
    const entry = this.acquire(normalizedLang);
    try {
      const worker = await entry.worker;

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
    } finally {
      this.release(normalizedLang, entry);
    }
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

  /** Worker della lingua (creato se manca), segnato come occupato: niente chiusura finché lavora. */
  private acquire(lang: string): WorkerEntry {
    let entry = this.workers.get(lang);
    if (!entry) {
      fs.mkdirSync(this.cachePath, { recursive: true });
      this.logger.log(`Creating Tesseract worker for "${lang}"`);
      const worker: Promise<Worker> = createWorker(lang, 1, { cachePath: this.cachePath }).catch((err) => {
        if (this.workers.get(lang)?.worker === worker) this.workers.delete(lang);
        throw err;
      });
      entry = { worker, busy: 0, idleTimer: null };
      this.workers.set(lang, entry);
    }
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    entry.busy++;
    return entry;
  }

  /** Fine richiesta: se il worker è rimasto senza lavoro, lo si chiude dopo OCR_WORKER_IDLE_MS. */
  private release(lang: string, entry: WorkerEntry): void {
    entry.busy--;
    if (entry.busy > 0 || this.workers.get(lang) !== entry) return;
    entry.idleTimer = setTimeout(() => {
      if (entry.busy > 0 || this.workers.get(lang) !== entry) return;
      this.workers.delete(lang);
      this.logger.log(`Closing idle Tesseract worker for "${lang}"`);
      void this.terminate(entry);
    }, OCR_WORKER_IDLE_MS);
    // Il timer non deve tenere in vita il processo (test, shutdown).
    entry.idleTimer.unref?.();
  }

  private async terminate(entry: WorkerEntry): Promise<void> {
    try {
      const worker = await entry.worker;
      await worker.terminate();
    } catch {
      /* creazione fallita o già chiuso */
    }
  }
}
