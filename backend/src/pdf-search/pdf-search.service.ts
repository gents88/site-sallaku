import { Injectable, Logger } from '@nestjs/common';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GutenbergProvider } from './providers/gutenberg.provider';
import { ArxivProvider } from './providers/arxiv.provider';
import { PmcProvider } from './providers/pmc.provider';
import { ZenodoProvider } from './providers/zenodo.provider';
import { WikimediaProvider } from './providers/wikimedia.provider';
import { PdfSearchProvider, PdfSearchResult } from './interfaces/pdf-search-result.interface';

// 20, not 12: the frontend's source filter (books / papers) narrows this
// same result set client-side, so a wider pool keeps each filtered view from
// looking sparse.
const DEFAULT_LIMIT = 30;

@Injectable()
export class PdfSearchService {
  private readonly logger = new Logger(PdfSearchService.name);
  private readonly providers: PdfSearchProvider[];

  constructor(
    internetArchive: InternetArchiveProvider,
    gutenberg: GutenbergProvider,
    arxiv: ArxivProvider,
    pmc: PmcProvider,
    zenodo: ZenodoProvider,
    wikimedia: WikimediaProvider,
  ) {
    this.providers = [internetArchive, gutenberg, arxiv, pmc, zenodo, wikimedia];
  }

  async search(query: string, limit: number = DEFAULT_LIMIT): Promise<PdfSearchResult[]> {
    // Over-fetch per provider so a shared limit still gets contributions from
    // both sources instead of one provider's results crowding out the other,
    // and so per-item attrition (restricted items, slow/failed metadata
    // lookups) doesn't visibly shrink the result count under real network
    // conditions (e.g. Railway → archive.org latency higher than local dev).
    const perProvider = Math.ceil(limit / this.providers.length) + 6;
    const settled = await Promise.allSettled(this.providers.map((p) => p.search(query, perProvider)));

    const lists: PdfSearchResult[][] = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        lists.push(outcome.value);
      } else {
        this.logger.warn(`Provider ${this.providers[i].source} failed: ${outcome.reason}`);
      }
    });

    // Alternanza round-robin tra le fonti, non una semplice concatenazione: con
    // sei fonti, concatenare e tagliare a `limit` farebbe sparire quelle in coda
    // ogni volta che le prime restituiscono molti risultati.
    const results: PdfSearchResult[] = [];
    for (let i = 0; results.length < limit; i++) {
      let added = false;
      for (const list of lists) {
        if (i < list.length && results.length < limit) {
          results.push(list[i]);
          added = true;
        }
      }
      if (!added) break;
    }
    return results;
  }
}
