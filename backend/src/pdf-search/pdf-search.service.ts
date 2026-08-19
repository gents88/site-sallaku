import { Injectable, Logger } from '@nestjs/common';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { PdfSearchProvider, PdfSearchResult } from './interfaces/pdf-search-result.interface';

const DEFAULT_LIMIT = 12;

@Injectable()
export class PdfSearchService {
  private readonly logger = new Logger(PdfSearchService.name);
  private readonly providers: PdfSearchProvider[];

  // Project Gutenberg was dropped: its catalog (verified via the Gutendex API)
  // never exposes an "application/pdf" format, only EPUB/MOBI/HTML/TXT — every
  // lookup there resolved to zero results, so it only added a wasted API call.
  constructor(internetArchive: InternetArchiveProvider) {
    this.providers = [internetArchive];
  }

  async search(query: string, limit: number = DEFAULT_LIMIT): Promise<PdfSearchResult[]> {
    // Over-fetch per provider so a shared limit still gets contributions from
    // both sources instead of one provider's results crowding out the other.
    const perProvider = Math.ceil(limit / this.providers.length) + 4;
    const settled = await Promise.allSettled(this.providers.map((p) => p.search(query, perProvider)));

    const results: PdfSearchResult[] = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        this.logger.warn(`Provider ${this.providers[i].source} failed: ${outcome.reason}`);
      }
    });

    return results.slice(0, limit);
  }
}
