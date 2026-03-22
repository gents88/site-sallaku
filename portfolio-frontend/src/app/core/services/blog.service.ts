import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Post,
  PostSummary,
  CreatePostPayload,
  UpdatePostPayload,
  BlogLanguage,
  BlogPdfDraft,
} from '../models/post.model';
import { ApiCacheService } from './api-cache.service';

const CACHE_PREFIX = 'blog:published';
const TTL = 2 * 60_000; // 2 minutes

@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly publicUrl = `${environment.apiUrl}/blog/posts`;
  private readonly adminUrl = `${environment.apiUrl}/blog/admin/posts`;
  constructor(private http: HttpClient, private cache: ApiCacheService) {}

  // Public (cached)
  getPublished(tag?: string): Observable<PostSummary[]> {
    const key = tag ? `${CACHE_PREFIX}:tag:${tag}` : CACHE_PREFIX;
    let params = new HttpParams();
    if (tag) params = params.set('tag', tag);
    return this.cache.get(key, () => this.http.get<PostSummary[]>(this.publicUrl, { params }), TTL);
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
}
