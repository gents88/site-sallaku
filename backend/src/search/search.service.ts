import { Inject, Injectable } from '@nestjs/common';
import { SEARCH_PROVIDER, SearchHit, SearchHitType, SearchProvider, SearchResult } from './interfaces/search.interface';

const SUGGEST_LIMIT = 5;

@Injectable()
export class SearchService {
  constructor(@Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider) {}

  search(q: string, lang: string | undefined, type: SearchHitType | undefined, page = 1, limit = 10): Promise<SearchResult> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    return this.provider.search({ q: q.trim(), lang, type, page: safePage, limit: safeLimit });
  }

  async suggest(q: string, lang?: string): Promise<SearchHit[]> {
    const { data } = await this.provider.search({ q: q.trim(), lang, page: 1, limit: SUGGEST_LIMIT });
    return data;
  }
}
