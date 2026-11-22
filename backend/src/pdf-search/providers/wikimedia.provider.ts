import { Injectable, Logger } from '@nestjs/common';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

interface CommonsImageInfo {
  url?: string;
  descriptionurl?: string;
  mime?: string;
  size?: number;
  extmetadata?: {
    Artist?: { value?: string };
    DateTimeOriginal?: { value?: string };
    DateTime?: { value?: string };
  };
}

interface CommonsPage {
  title?: string;
  pageid?: number;
  index?: number;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

/** Oltre questa dimensione un PDF non passa dal proxy (PROXY_MAX_BYTES del controller): inutile proporlo. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function stripHtml(input: string): string {
  const decoded = input.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (match, code: string) =>
    code.startsWith('#') ? String.fromCodePoint(Number(code.slice(1))) : (HTML_ENTITIES[code] ?? match),
  );
  return decoded.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Wikimedia Commons: l'archivio di file liberi di Wikipedia contiene decine di
 * migliaia di PDF (libri e documenti storici di pubblico dominio, atti, manuali)
 * con licenza libera. API MediaWiki gratuita e senza chiave; la politica di
 * Wikimedia richiede però uno User-Agent che identifichi il client.
 */
@Injectable()
export class WikimediaProvider implements PdfSearchProvider {
  readonly source = 'wikimedia' as const;
  private readonly logger = new Logger(WikimediaProvider.name);

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      // namespace 6 = File:, filetype:pdf = solo PDF
      gsrsearch: `filetype:pdf ${query}`,
      gsrnamespace: '6',
      gsrlimit: String(limit),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiextmetadatafilter: 'Artist|DateTimeOriginal|DateTime',
    });

    try {
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
        headers: { 'User-Agent': 'SiteSallakuPdfSearch/1.0 (https://gentsallaku.it)', Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Wikimedia Commons search ${res.status}`);
        return [];
      }
      const data = (await res.json()) as CommonsResponse;
      const pages = Object.values(data.query?.pages ?? {});
      // `pages` è una mappa per id: l'ordine di rilevanza sta nel campo `index`.
      pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return pages.map((p) => this.toResult(p)).filter((r): r is PdfSearchResult => r !== null);
    } catch (err) {
      this.logger.warn(`Wikimedia Commons search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toResult(page: CommonsPage): PdfSearchResult | null {
    const info = page.imageinfo?.[0];
    if (!page.title || !info?.url || page.pageid === undefined) return null;
    if (info.mime && info.mime !== 'application/pdf') return null;
    if (info.size && info.size > MAX_PDF_BYTES) return null;

    const title = page.title.replace(/^File:/i, '').replace(/\.pdf$/i, '').replace(/_/g, ' ').trim();
    const meta = info.extmetadata;
    const author = meta?.Artist?.value ? stripHtml(meta.Artist.value) : '';
    const year = /\b(\d{4})\b/.exec(meta?.DateTimeOriginal?.value ?? meta?.DateTime?.value ?? '')?.[1] ?? '';

    return {
      id: `wikimedia-${page.pageid}`,
      title,
      // Il campo Artist è testo libero e a volte lunghissimo (crediti completi): meglio niente che rumore.
      author: author.length > 80 ? '' : author,
      year,
      source: 'wikimedia',
      sourceLabel: 'Wikimedia Commons',
      pdfUrl: info.url,
      coverUrl: null,
      detailsUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      previewable: false,
      scanPpi: null,
    };
  }
}
