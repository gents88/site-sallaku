import { Injectable, Logger } from '@nestjs/common';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

interface IaDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  year?: string;
}

interface IaMetadataFile {
  name: string;
  format?: string;
}

interface IaMetadataResponse {
  metadata?: { 'access-restricted-item'?: string };
  files?: IaMetadataFile[];
}

/**
 * Internet Archive's advancedsearch only tells us an item *has* a PDF file,
 * not its filename (that varies: "{id}.pdf", "{id}_djvu.pdf", ...), so each
 * hit needs a follow-up /metadata/{id} call to resolve the real download path.
 */
@Injectable()
export class InternetArchiveProvider implements PdfSearchProvider {
  readonly source = 'internet_archive' as const;
  private readonly logger = new Logger(InternetArchiveProvider.name);

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    const params = new URLSearchParams({
      q: `title:(${query}) AND mediatype:(texts) AND format:(PDF)`,
      output: 'json',
      rows: String(limit),
      page: '1',
      sort: 'downloads desc',
    });
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'creator');
    params.append('fl[]', 'year');

    let docs: IaDoc[] = [];
    try {
      const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`advancedsearch ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { response?: { docs?: IaDoc[] } };
      docs = data.response?.docs ?? [];
    } catch (err) {
      this.logger.warn(`advancedsearch failed: ${(err as Error).message}`);
      return [];
    }

    const results = await Promise.all(docs.map((doc) => this.toResult(doc)));
    return results.filter((r): r is PdfSearchResult => r !== null);
  }

  private async toResult(doc: IaDoc): Promise<PdfSearchResult | null> {
    const pdfFile = await this.findPdfFile(doc.identifier);
    if (!pdfFile) return null;
    const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator;
    return {
      id: `ia-${doc.identifier}`,
      title: doc.title ?? doc.identifier,
      author: creator ?? '',
      year: doc.year ?? '',
      source: 'internet_archive',
      sourceLabel: 'Internet Archive',
      pdfUrl: `https://archive.org/download/${doc.identifier}/${encodeURIComponent(pdfFile)}`,
      coverUrl: `https://archive.org/services/img/${doc.identifier}`,
      detailsUrl: `https://archive.org/details/${doc.identifier}`,
    };
  }

  private async findPdfFile(identifier: string): Promise<string | null> {
    try {
      const res = await fetch(`https://archive.org/metadata/${identifier}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as IaMetadataResponse;

      // Controlled Digital Lending items still list a PDF in `files`, but
      // fetching it 401s without a borrowed/logged-in session — skip them
      // rather than surfacing a result that can't actually be opened.
      if (data.metadata?.['access-restricted-item'] === 'true') return null;

      const files = data.files ?? [];
      const pdf = files.find((f) => f.format === 'Text PDF') ?? files.find((f) => f.name?.toLowerCase().endsWith('.pdf'));
      return pdf?.name ?? null;
    } catch (err) {
      this.logger.warn(`metadata failed for ${identifier}: ${(err as Error).message}`);
      return null;
    }
  }
}
