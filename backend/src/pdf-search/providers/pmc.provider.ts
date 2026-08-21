import { Injectable, Logger } from '@nestjs/common';
import { PdfSearchProvider, PdfSearchResult } from '../interfaces/pdf-search-result.interface';

interface EuropePmcResult {
  pmid?: string;
  pmcid?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  hasPDF?: string;
}

interface EuropePmcResponse {
  resultList?: { result?: EuropePmcResult[] };
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Europe PMC titles come HTML-entity-encoded and can carry markup (e.g. "&lt;sup&gt;23&lt;/sup&gt;Na-MRI") — decode then strip tags for plain display text. */
function cleanText(input: string): string {
  const decoded = input.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (match, code: string) =>
    code.startsWith('#') ? String.fromCodePoint(Number(code.slice(1))) : (HTML_ENTITIES[code] ?? match),
  );
  return decoded.replace(/<[^>]+>/g, '').trim();
}

/**
 * PubMed Central via the Europe PMC REST API (free, no key). Only the
 * open-access subset with a PDF actually available (HAS_PDF:Y) is queried.
 * Unlike the other three sources, europepmc.org sends `X-Frame-Options: DENY`
 * on the PDF itself — an absolute block we cannot override from our side (not
 * our server, unlike the Gutenberg endpoint) — so every result here is marked
 * `previewable: false` and the frontend must skip the iframe for these.
 */
@Injectable()
export class PmcProvider implements PdfSearchProvider {
  readonly source = 'pmc' as const;
  private readonly logger = new Logger(PmcProvider.name);

  async search(query: string, limit: number): Promise<PdfSearchResult[]> {
    // Scoped to TITLE:(...), not a bare unqualified query: Europe PMC's
    // default query field matches across title/abstract/author/full text
    // combined, so an unqualified multi-word query loosely OR-matches any
    // single field — e.g. "piccolo principe" surfaced unrelated biomedical
    // papers co-authored by someone surnamed "Principe" (verified live).
    // TITLE:(term1 term2) keeps the implicit AND but restricts it to the
    // title, which is what a title/topic search wants — verified live this
    // still returns hundreds of relevant hits for real topics (e.g. "CRISPR
    // gene editing") while correctly returning zero for the book title.
    const params = new URLSearchParams({
      query: `TITLE:(${query}) AND OPEN_ACCESS:Y AND HAS_PDF:Y`,
      format: 'json',
      pageSize: String(limit),
    });

    try {
      const res = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Europe PMC search ${res.status}`);
        return [];
      }
      const data = (await res.json()) as EuropePmcResponse;
      const results = data.resultList?.result ?? [];
      return results
        .map((r) => this.toResult(r))
        .filter((r): r is PdfSearchResult => r !== null);
    } catch (err) {
      this.logger.warn(`Europe PMC search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private toResult(r: EuropePmcResult): PdfSearchResult | null {
    if (!r.pmcid || r.hasPDF !== 'Y') return null;
    const firstAuthor = r.authorString?.split(',')[0]?.trim() ?? '';
    return {
      id: `pmc-${r.pmcid}`,
      title: r.title ? cleanText(r.title) : r.pmcid,
      author: firstAuthor,
      year: r.pubYear ?? '',
      source: 'pmc',
      sourceLabel: 'PubMed Central',
      pdfUrl: `https://europepmc.org/articles/${r.pmcid}?pdf=render`,
      coverUrl: null,
      detailsUrl: `https://europepmc.org/article/PMC/${r.pmcid}`,
      previewable: false,
      scanPpi: null, // native digital PDF, never a scan
    };
  }
}
