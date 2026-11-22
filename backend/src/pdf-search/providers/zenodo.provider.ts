import { Injectable, Logger } from '@nestjs/common';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

interface ZenodoFile {
  key?: string;
  links?: { self?: string };
}

interface ZenodoHit {
  id?: number | string;
  metadata?: {
    title?: string;
    creators?: { name?: string }[];
    publication_date?: string;
  };
  files?: ZenodoFile[];
  links?: { self_html?: string; html?: string };
}

interface ZenodoResponse {
  hits?: { hits?: ZenodoHit[] };
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** I titoli Zenodo sono scritti dall'autore e possono contenere entità/markup HTML: testo semplice per la visualizzazione. */
function cleanText(input: string): string {
  const decoded = input.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (match, code: string) =>
    code.startsWith('#') ? String.fromCodePoint(Number(code.slice(1))) : (HTML_ENTITIES[code] ?? match),
  );
  return decoded.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Zenodo (CERN): archivio open access di paper, tesi, report, libri e dataset
 * documentali, con API REST gratuita e senza chiave. Si interrogano solo i
 * record pubblici di tipo "publication" che hanno almeno un file PDF.
 *
 * Il PDF è servito da zenodo.org: si lascia `previewable: false` perché non si
 * può garantire che consenta l'incorporamento in iframe — il frontend usa il
 * viewer pdf.js (via proxy), che funziona comunque.
 */
@Injectable()
export class ZenodoProvider implements PdfSearchProvider {
  readonly source = 'zenodo' as const;
  private readonly logger = new Logger(ZenodoProvider.name);

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'publication',
      access_status: 'open',
      file_type: 'pdf',
      size: String(limit),
      sort: 'bestmatch',
    });

    try {
      const res = await fetch(`https://zenodo.org/api/records?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Zenodo search ${res.status}`);
        return [];
      }
      const data = (await res.json()) as ZenodoResponse;
      return (data.hits?.hits ?? [])
        .map((h) => this.toResult(h))
        .filter((r): r is PdfSearchResult => r !== null);
    } catch (err) {
      this.logger.warn(`Zenodo search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toResult(hit: ZenodoHit): PdfSearchResult | null {
    const pdf = hit.files?.find((f) => f.key?.toLowerCase().endsWith('.pdf') && f.links?.self);
    const pdfUrl = pdf?.links?.self;
    if (hit.id === undefined || !pdfUrl) return null;

    const meta = hit.metadata ?? {};
    const firstAuthor = meta.creators?.[0]?.name?.trim() ?? '';
    return {
      id: `zenodo-${hit.id}`,
      title: meta.title ? cleanText(meta.title) : `Zenodo ${hit.id}`,
      author: firstAuthor,
      year: meta.publication_date?.slice(0, 4) ?? '',
      source: 'zenodo',
      sourceLabel: 'Zenodo',
      pdfUrl,
      coverUrl: null,
      detailsUrl: hit.links?.self_html ?? hit.links?.html ?? `https://zenodo.org/records/${hit.id}`,
      previewable: false,
      scanPpi: null, // PDF digitale, non una scansione di libro
    };
  }
}
