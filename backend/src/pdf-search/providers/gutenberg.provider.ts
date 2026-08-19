import { Injectable, Logger } from '@nestjs/common';
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

/** Gutendex (gutendex.com) is a free, unofficial JSON API over the Project Gutenberg catalog. */
@Injectable()
export class GutenbergProvider implements PdfSearchProvider {
  readonly source = 'gutenberg' as const;
  private readonly logger = new Logger(GutenbergProvider.name);

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
    const pdfUrl = Object.entries(book.formats).find(([mime]) => mime === 'application/pdf')?.[1];
    if (!pdfUrl) return null;
    const coverUrl = Object.entries(book.formats).find(([mime]) => mime.startsWith('image/'))?.[1] ?? null;
    return {
      id: `gb-${book.id}`,
      title: book.title,
      author: book.authors?.[0]?.name ?? '',
      year: '',
      source: 'gutenberg',
      sourceLabel: 'Project Gutenberg',
      pdfUrl,
      coverUrl,
      detailsUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    };
  }
}
