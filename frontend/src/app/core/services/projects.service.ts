import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Project, CreateProjectPayload, UpdateProjectPayload } from '../models/project.model';
import { ApiCacheService } from './api-cache.service';
import { SKIP_CACHE_INTERCEPTOR } from '../interceptors/cache.interceptor';

const CACHE_KEY = 'projects:all';
const SLUG_CACHE_PREFIX = 'projects:slug:';
const TTL = 2 * 60_000; // 2 minutes

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly url = `${environment.apiUrl}/projects`;
  constructor(private http: HttpClient, private cache: ApiCacheService) {}

  /** Public: cached for 2 minutes. */
  getAll(): Observable<Project[]> {
    const context = new HttpContext().set(SKIP_CACHE_INTERCEPTOR, true);
    return this.cache.get(CACHE_KEY, () => this.http.get<Project[]>(this.url, { context }), TTL);
  }
  getOne(id: string): Observable<Project> { return this.http.get<Project>(`${this.url}/${id}`); }
  /** Pagina pubblica /projects/:slug. */
  // In cache come la lista: così il prefetch al passaggio sulla card rende
  // l'apertura del case study istantanea (e la view transition trova già il titolo).
  getBySlug(slug: string): Observable<Project> {
    const context = new HttpContext().set(SKIP_CACHE_INTERCEPTOR, true);
    return this.cache.get(`${SLUG_CACHE_PREFIX}${slug}`, () => this.http.get<Project>(`${this.url}/slug/${encodeURIComponent(slug)}`, { context }), TTL);
  }
  /** Drag & drop in admin: l'indice nell'array diventa `order`. */
  reorder(ids: string[]): Observable<void> {
    this.cache.invalidate(CACHE_KEY);
    return this.http.patch<void>(`${this.url}/reorder`, { ids });
  }
  create(payload: CreateProjectPayload): Observable<Project> {
    this.cache.invalidate(CACHE_KEY);
    return this.http.post<Project>(this.url, payload);
  }
  update(id: string, payload: UpdateProjectPayload): Observable<Project> {
    this.cache.invalidate(CACHE_KEY);
    this.cache.invalidatePrefix(SLUG_CACHE_PREFIX);
    return this.http.put<Project>(`${this.url}/${id}`, payload);
  }
  remove(id: string): Observable<void> {
    this.cache.invalidate(CACHE_KEY);
    this.cache.invalidatePrefix(SLUG_CACHE_PREFIX);
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
