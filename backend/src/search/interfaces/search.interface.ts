export type SearchHitType = 'post' | 'project';

export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  excerpt: string;
  url: string;
  tags: string[];
  updatedAt: Date;
}

export interface SearchParams {
  q: string;
  lang?: string;
  type?: SearchHitType;
  page: number;
  limit: number;
  /**
   * 'full' (default): indice full-text, ordinato per pertinenza.
   * 'prefix': regex, trova anche parole parziali mentre si digita (suggest).
   */
  mode?: 'full' | 'prefix';
}

export interface SearchResult {
  data: SearchHit[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchProvider {
  search(params: SearchParams): Promise<SearchResult>;
}

/** DI token — swap MongoSearchProvider for a Meilisearch/Algolia provider later without touching SearchService/SearchController. */
export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
