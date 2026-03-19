import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Project, CreateProjectPayload, UpdateProjectPayload } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly url = `${environment.apiUrl}/projects`;
  constructor(private http: HttpClient) {}

  getAll(): Observable<Project[]> { return this.http.get<Project[]>(this.url); }
  getOne(id: string): Observable<Project> { return this.http.get<Project>(`${this.url}/${id}`); }
  create(payload: CreateProjectPayload): Observable<Project> { return this.http.post<Project>(this.url, payload); }
  update(id: string, payload: UpdateProjectPayload): Observable<Project> { return this.http.put<Project>(`${this.url}/${id}`, payload); }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}`); }
}
