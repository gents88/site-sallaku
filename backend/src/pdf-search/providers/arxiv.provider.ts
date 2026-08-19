import { Injectable, Logger } from '@nestjs/common';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

const ENTRY_RE = /<entry>([\s\S]*?)<\/entry>/g;
const ID_RE = /<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/;
const PDF_LINK_RE = /<link[^>]*title="pdf"[^>]*href="([^"]+)"[^>]*\/>|<link[^>]*href="([^"]+)"[^>]*title="pdf"[^>]*\/>/;
const AUTHOR_RE = /<author>\s*<name>([^<]+)<\/name>/;
const PUBLISHED_RE = /<published>(\d{4})-/;

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXmlEntities(input: string): string {
  return input.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (match, code: string) => {
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return XML_ENTITIES[code] ?? match;
  });
}

/**
 * arXiv's search API returns an Atom (XML) feed, not JSON, and has no PDF-only
 * filter to apply server-side — but every paper on it has a real PDF, so
 * unlike Gutenberg this needs no conversion step, just field extraction.
 * A tiny targeted regex extraction is used instead of a full XML parser
 * dependency: the feed's entry shape is a stable, narrow, well-known format,
 * not arbitrary XML.
 */
@Injectable()
export class ArxivProvider implements PdfSearchProvider {
  readonly source = 'arxiv' as const;
  private readonly logger = new Logger(ArxivProvider.name);

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: '0',
      max_results: String(limit),
      sortBy: 'relevance',
      sortOrder: 'descending',
    });

    try {
      const res = await fetch(`http://export.arxiv.org/api/query?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`arxiv query ${res.status}`);
        return [];
      }
      const xml = await res.text();
      const results: PdfSearchResult[] = [];
      for (const match of xml.matchAll(ENTRY_RE)) {
        const result = this.parseEntry(match[1]);
        if (result) results.push(result);
      }
      return results;
    } catch (err) {
      this.logger.warn(`arxiv query failed: ${(err as Error).message}`);
      return [];
    }
  }

  private parseEntry(entry: string): PdfSearchResult | null {
    const id = ID_RE.exec(entry)?.[1];
    const pdfMatch = PDF_LINK_RE.exec(entry);
    const pdfUrl = pdfMatch?.[1] ?? pdfMatch?.[2];
    if (!id || !pdfUrl) return null;

    const rawTitle = TITLE_RE.exec(entry)?.[1] ?? id;
    const title = decodeXmlEntities(rawTitle.replace(/\s+/g, ' ').trim());
    const author = AUTHOR_RE.exec(entry)?.[1];
    const year = PUBLISHED_RE.exec(entry)?.[1] ?? '';

    return {
      id: `arxiv-${id}`,
      title,
      author: author ? decodeXmlEntities(author.trim()) : '',
      year,
      source: 'arxiv',
      sourceLabel: 'arXiv',
      pdfUrl,
      coverUrl: null,
      detailsUrl: `https://arxiv.org/abs/${id}`,
    };
  }
}
