import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SearchHitType = 'post' | 'project';

export interface SearchHit {
  id: string;
  type: SearchHitType;
  title: string;
  excerpt: string;
  url: string;
  tags: string[];
  updatedAt: string;
}

export interface SearchResponse {
  data: SearchHit[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchOptions {
  lang?: string;
  type?: SearchHitType;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly url = `${environment.apiUrl}/search`;
  constructor(private http: HttpClient) {}

  search(q: string, opts: SearchOptions = {}): Observable<SearchResponse> {
    let params = new HttpParams().set('q', q);
    if (opts.lang) params = params.set('lang', opts.lang);
    if (opts.type) params = params.set('type', opts.type);
    if (opts.page) params = params.set('page', opts.page);
    if (opts.limit) params = params.set('limit', opts.limit);
    return this.http.get<SearchResponse>(this.url, { params });
  }

  suggest(q: string, lang?: string): Observable<SearchHit[]> {
    let params = new HttpParams().set('q', q);
    if (lang) params = params.set('lang', lang);
    return this.http.get<SearchHit[]>(`${this.url}/suggest`, { params });
  }
}
