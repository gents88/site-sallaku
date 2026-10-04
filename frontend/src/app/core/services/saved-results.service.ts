import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type SavedResultToolType = 'pdf-translate' | 'ai-ppt' | 'ai-formatter' | 'pdf-summary' | 'ocr';

export interface SavedResultListItem {
  id: string;
  toolType: SavedResultToolType;
  title: string;
  createdAt: string;
}

export interface SavedResult extends SavedResultListItem {
  payload: Record<string, unknown>;
  updatedAt: string;
}

export interface CreateSavedResultPayload {
  toolType: SavedResultToolType;
  title: string;
  payload: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class SavedResultsService {
  private readonly apiUrl = `${environment.apiUrl}/saved-results`;

  constructor(private http: HttpClient) {}

  save(payload: CreateSavedResultPayload): Observable<SavedResult> {
    return this.http.post<SavedResult>(this.apiUrl, payload);
  }

  list(): Observable<{ data: SavedResultListItem[]; total: number }> {
    return this.http.get<{ data: SavedResultListItem[]; total: number }>(this.apiUrl);
  }

  get(id: string): Observable<SavedResult> {
    return this.http.get<SavedResult>(`${this.apiUrl}/${id}`);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
