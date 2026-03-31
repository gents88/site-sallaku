import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Post,
  PostSummary,
  CreatePostPayload,
  UpdatePostPayload,
  BlogLanguage,
  BlogPdfDraft,
  PdfExtractResult,
} from '../models/post.model';
import { ApiCacheService } from './api-cache.service';

const CACHE_PREFIX = 'blog:published';
const TTL = 2 * 60_000; // 2 minutes

export interface PaginatedPosts {
  data: PostSummary[];
  total: number;
  page: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly publicUrl = `${environment.apiUrl}/blog/posts`;
  private readonly adminUrl = `${environment.apiUrl}/blog/admin/posts`;
  constructor(private http: HttpClient, private cache: ApiCacheService) {}

  // Public (cached, paginated)
  getPublished(tag?: string, page = 1, limit = 10): Observable<PaginatedPosts> {
    const key = `${CACHE_PREFIX}:p${page}:l${limit}${tag ? ':tag:' + tag : ''}`;
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (tag) params = params.set('tag', tag);
    return this.cache.get(key, () => this.http.get<PaginatedPosts>(this.publicUrl, { params }), TTL);
  }

  /** Convenience: get just the first page of posts (backwards compatibility). */
  getPublishedAll(tag?: string): Observable<PostSummary[]> {
    return this.getPublished(tag, 1, 50).pipe(map(r => r.data));
  }

  getBySlug(slug: string): Observable<Post> {
    return this.cache.get(`blog:slug:${slug}`, () => this.http.get<Post>(`${this.publicUrl}/${slug}`), TTL);
  }

  // Admin
  getAll(): Observable<Post[]> { return this.http.get<Post[]>(this.adminUrl); }
  getOne(id: string): Observable<Post> { return this.http.get<Post>(`${this.adminUrl}/${id}`); }
  create(payload: CreatePostPayload): Observable<Post> {
    this.cache.invalidatePrefix(CACHE_PREFIX);
    return this.http.post<Post>(this.adminUrl, payload);
  }
  update(id: string, payload: UpdatePostPayload): Observable<Post> {
    this.cache.invalidatePrefix(CACHE_PREFIX);
    this.cache.invalidatePrefix('blog:slug:');
    return this.http.put<Post>(`${this.adminUrl}/${id}`, payload);
  }
  remove(id: string): Observable<void> {
    this.cache.invalidatePrefix(CACHE_PREFIX);
    this.cache.invalidatePrefix('blog:slug:');
    return this.http.delete<void>(`${this.adminUrl}/${id}`);
  }

  trackView(slug: string): Observable<void> {
    return this.http.post<void>(`${this.publicUrl}/${slug}/view`, {});
  }

  generateFromPdf(file: File, language: BlogLanguage, context = ''): Observable<HttpEvent<BlogPdfDraft>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language);
    if (context.trim()) {
      formData.append('context', context.trim());
    }

    return this.http.post<BlogPdfDraft>(`${this.adminUrl}/generate-from-pdf`, formData, {
      observe: 'events',
      reportProgress: true,
    });
  }

  extractPdf(file: File): Observable<PdfExtractResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<PdfExtractResult>(`${this.adminUrl}/extract-pdf`, formData);
  }

  translateText(text: string, from: string, to: string): Observable<string> {
    return this.http
      .post<{ translatedText: string }>(`${environment.apiUrl}/blog/admin/translate`, { text, from, to })
      .pipe(map(r => r.translatedText));
  }
}
