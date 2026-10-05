import { Injectable } from '@nestjs/common';
import { buildOgSvg } from './og-image';

// sharp è un export CommonJS di default: vedi conversion/converters/image.converter.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input?: Buffer | string) => import('sharp').Sharp = require('sharp');

const LANGS = ['en', 'sq', 'pt', 'es', 'fr', 'de'] as const;

export interface OgPost {
  _id: unknown;
  slug: string;
  title: string;
  tags?: string[];
  updatedAt?: Date;
  [field: string]: unknown;
}

/** PNG di anteprima per i social, con una piccola cache in memoria (la generazione costa ~50–100 ms). */
@Injectable()
export class OgImageService {
  private readonly cache = new Map<string, Buffer>();
  private readonly maxEntries = 150;

  async render(post: OgPost, lang?: string): Promise<Buffer> {
    const l = LANGS.find(x => x === lang);
    const title = (l && typeof post[`title_${l}`] === 'string' && (post[`title_${l}`] as string)) || post.title;
    const key = `${String(post._id)}:${l ?? 'it'}:${post.updatedAt?.getTime() ?? 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const svg = buildOgSvg({ title, tag: post.tags?.[0], slug: post.slug });
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, png);
    return png;
  }
}
