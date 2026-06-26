import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Project, CreateProjectPayload, UpdateProjectPayload } from '../models/project.model';
import { ApiCacheService } from './api-cache.service';

const CACHE_KEY = 'projects:all';
const TTL = 2 * 60_000; // 2 minutes

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly url = `${environment.apiUrl}/projects`;
  constructor(private http: HttpClient, private cache: ApiCacheService) {}

  /** Public: cached for 2 minutes. */
  getAll(): Observable<Project[]> {
    return this.cache.get(CACHE_KEY, () => this.http.get<Project[]>(this.url), TTL);
  }
  getOne(id: string): Observable<Project> { return this.http.get<Project>(`${this.url}/${id}`); }
  create(payload: CreateProjectPayload): Observable<Project> {
    this.cache.invalidate(CACHE_KEY);
    return this.http.post<Project>(this.url, payload);
  }
  update(id: string, payload: UpdateProjectPayload): Observable<Project> {
    this.cache.invalidate(CACHE_KEY);
    return this.http.put<Project>(`${this.url}/${id}`, payload);
  }
  remove(id: string): Observable<void> {
    this.cache.invalidate(CACHE_KEY);
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
