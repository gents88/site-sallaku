import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataConverter } from '../../conversion/converters/data.converter';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

interface GutendexAuthor {
  name: string;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  formats: Record<string, string>;
}

// Above this, textToPdf's per-line pdf-lib drawing becomes slow enough (and the
// resulting PDF large enough) that converting on a request thread stops being
// reasonable — truncate and say so rather than hanging the request.
const MAX_TEXT_CHARS = 1_500_000;

// Books rarely change on Gutenberg once published — cache converted PDFs for
// the life of the process instead of re-running textToPdf on every open.
const MAX_CACHE_ENTRIES = 50;

/**
 * Gutendex (gutendex.com) is a free, unofficial JSON API over the Project
 * Gutenberg catalog. Gutenberg itself never publishes a PDF — verified live,
 * every book's `formats` only ever has EPUB/MOBI/HTML/TXT — so results here
 * point at our own `/pdf-search/gutenberg/:id` endpoint, which fetches the
 * book's plain-text edition and renders it into a PDF with pdf-lib
 * (DataConverter.textToPdf, shared with the file-conversion tool).
 */
@Injectable()
export class GutenbergProvider implements PdfSearchProvider {
  readonly source = 'gutenberg' as const;
  private readonly logger = new Logger(GutenbergProvider.name);
  private readonly pdfCache = new Map<string, Buffer>();

  constructor(private readonly dataConverter: DataConverter) {}

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    const params = new URLSearchParams({ search: query });
    try {
      const res = await fetch(`https://gutendex.com/books/?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`gutendex search ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { results?: GutendexBook[] };
      const books = data.results ?? [];
      return books
        .map((book) => this.toResult(book))
        .filter((r): r is PdfSearchResult => r !== null)
        .slice(0, limit);
    } catch (err) {
      this.logger.warn(`gutendex search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toResult(book: GutendexBook): PdfSearchResult | null {
    const hasText = Object.keys(book.formats).some((mime) => mime.startsWith('text/plain'));
    if (!hasText) return null;
    const coverUrl = Object.entries(book.formats).find(([mime]) => mime.startsWith('image/'))?.[1] ?? null;
    return {
      id: `gb-${book.id}`,
      title: book.title,
      author: book.authors?.[0]?.name ?? '',
      year: '',
      source: 'gutenberg',
      sourceLabel: 'Project Gutenberg',
      // Relative — PdfSearchController rewrites this to an absolute URL using
      // the incoming request's own host, so it works unchanged in dev/uat/prod.
      pdfUrl: `/api/v1/pdf-search/gutenberg/${book.id}`,
      coverUrl,
      detailsUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      previewable: true,
    };
  }

  /** Converts a Gutenberg book's plain-text edition to PDF on demand, cached per process. */
  async fetchAsPdf(id: string): Promise<Buffer> {
    const cached = this.pdfCache.get(id);
    if (cached) return cached;

    const book = await this.fetchBook(id);
    const textUrl = Object.entries(book.formats).find(([mime]) => mime.startsWith('text/plain'))?.[1];
    if (!textUrl) throw new NotFoundException(`No plain-text edition available for Gutenberg book ${id}`);

    const textRes = await fetch(textUrl, { signal: AbortSignal.timeout(15_000) });
    if (!textRes.ok) throw new NotFoundException(`Could not fetch Gutenberg text for book ${id}`);
    let text = await textRes.text();

    text = this.sanitizeForPdf(text);
    text = this.stripBoilerplate(text);
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS) + '\n\n[... testo troncato per lunghezza ...]';
    }

    const header = `${book.title}\n${book.authors?.[0]?.name ?? ''}\n\n`;
    let pdf: Buffer;
    try {
      pdf = await this.dataConverter.textToPdf(header + text);
    } catch (err) {
      // pdf-lib's WinAnsi encoder rejects any character outside CP1252 — sanitizeForPdf
      // strips the known offenders, but Gutenberg's catalog is too large to guarantee
      // every remaining edge case, so a leftover one fails the request cleanly.
      this.logger.warn(`textToPdf failed for Gutenberg book ${id}: ${(err as Error).message}`);
      throw new NotFoundException(`Could not render Gutenberg book ${id} to PDF`);
    }

    if (this.pdfCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.pdfCache.keys().next().value;
      if (oldestKey !== undefined) this.pdfCache.delete(oldestKey);
    }
    this.pdfCache.set(id, pdf);
    return pdf;
  }

  private async fetchBook(id: string): Promise<GutendexBook> {
    const res = await fetch(`https://gutendex.com/books/${id}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new NotFoundException(`Gutenberg book ${id} not found`);
    return (await res.json()) as GutendexBook;
  }

  /**
   * pdf-lib's WinAnsi standard-font encoder throws on any character outside
   * CP1252 — including plain control characters. Gutenberg's plain-text
   * files are CRLF and sometimes use form-feed (\x0C) as a page break, both
   * of which crash textToPdf() if passed through untouched.
   */
  private sanitizeForPdf(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\f/g, '\n\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
  }

  /** Trims Project Gutenberg's standard license header/footer when present, leaving just the book. */
  private stripBoilerplate(text: string): string {
    const startMatch = text.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
    const endMatch = text.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
    const start = startMatch ? (startMatch.index ?? 0) + startMatch[0].length : 0;
    const end = endMatch ? endMatch.index : text.length;
    if (end === undefined || end <= start) return text;
    return text.slice(start, end).trim();
  }
}
