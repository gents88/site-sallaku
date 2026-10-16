import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as opentype from 'opentype.js';
import { TextShaper, buildOgSvg } from './og-image';

// sharp è un export CommonJS di default: vedi conversion/converters/image.converter.ts
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: (input?: Buffer | string) => import('sharp').Sharp = require('sharp');

const LANGS = ['en', 'sq', 'pt', 'es', 'fr', 'de'] as const;

/**
 * Liberation Sans (OFL, vedi fonts/LICENSE), copiato in dist da nest-cli.json.
 * Il testo diventa path: niente dipendenza dai font installati sul server.
 */
const FONTS_DIRS = [
  path.join(__dirname, 'fonts'),
  // Sviluppo: un `nest start --watch` avviato prima dell'aggiunta dei font non li ha in dist.
  path.join(process.cwd(), 'src', 'blog', 'og-image', 'fonts'),
];

export function createShaper(fontsDir = FONTS_DIRS.find(dir => fs.existsSync(path.join(dir, 'LiberationSans-Bold.ttf'))) ?? FONTS_DIRS[0]): TextShaper {
  const regular = opentype.loadSync(path.join(fontsDir, 'LiberationSans-Regular.ttf'));
  const bold = opentype.loadSync(path.join(fontsDir, 'LiberationSans-Bold.ttf'));
  return {
    width: (text, size, isBold) => (isBold ? bold : regular).getAdvanceWidth(text, size),
    path: (text, x, y, size, isBold) => (isBold ? bold : regular).getPath(text, x, y, size).toPathData(1),
  };
}

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
  private shaper?: TextShaper;

  async render(post: OgPost, lang?: string): Promise<Buffer> {
    const l = LANGS.find(x => x === lang);
    const title = (l && typeof post[`title_${l}`] === 'string' && (post[`title_${l}`] as string)) || post.title;
    const key = `${String(post._id)}:${l ?? 'it'}:${post.updatedAt?.getTime() ?? 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    this.shaper ??= createShaper();
    const svg = buildOgSvg({ title, tag: post.tags?.[0], slug: post.slug }, this.shaper);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    if (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, png);
    return png;
  }
}
