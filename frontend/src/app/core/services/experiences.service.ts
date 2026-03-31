import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Experience, CreateExperiencePayload, UpdateExperiencePayload } from '../models/experience.model';

@Injectable({ providedIn: 'root' })
export class ExperiencesService {
  private readonly url = `${environment.apiUrl}/experiences`;
  constructor(private http: HttpClient) {}

  getAll(): Observable<Experience[]> { return this.http.get<Experience[]>(this.url); }
  getOne(id: string): Observable<Experience> { return this.http.get<Experience>(`${this.url}/${id}`); }
  create(payload: CreateExperiencePayload): Observable<Experience> { return this.http.post<Experience>(this.url, payload); }
  update(id: string, payload: UpdateExperiencePayload): Observable<Experience> { return this.http.put<Experience>(`${this.url}/${id}`, payload); }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}`); }
}
