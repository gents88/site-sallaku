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
