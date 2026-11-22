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

const VERDICT_TTL_MS = 60 * 60 * 1000;
const VERDICT_CACHE_MAX = 500;

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
  private readonly verdicts = new Map<string, { ok: boolean; until: number }>();

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
      const results = (data.resultList?.result ?? [])
        .map((r) => this.toResult(r))
        .filter((r): r is PdfSearchResult => r !== null);
      // HAS_PDF:Y non basta: per alcuni articoli Europe PMC poi risponde
      // "Failed to retrieve PDF". Si scartano quelli che il PDF non lo danno davvero.
      const available = await Promise.all(results.map((r) => this.pdfAvailable(r.pdfUrl)));
      return results.filter((_, i) => available[i]);
    } catch (err) {
      this.logger.warn(`Europe PMC search failed: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Il PDF si scarica davvero? Vale solo un "no" certo (risposta non-OK o non PDF):
   * un timeout o un errore di rete non scartano il risultato, perché dipendono dal
   * momento e non dall'articolo. Gli esiti si ricordano per un'ora.
   */
  private async pdfAvailable(url: string): Promise<boolean> {
    const cached = this.verdicts.get(url);
    if (cached && cached.until > Date.now()) return cached.ok;

    let ok = true;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
      ok = res.ok && (res.headers.get('content-type') ?? '').includes('application/pdf');
      void res.body?.cancel().catch(() => undefined); // basta l'intestazione, non si scarica il file
    } catch {
      return true;
    }

    if (this.verdicts.size >= VERDICT_CACHE_MAX) this.verdicts.clear();
    this.verdicts.set(url, { ok, until: Date.now() + VERDICT_TTL_MS });
    return ok;
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
