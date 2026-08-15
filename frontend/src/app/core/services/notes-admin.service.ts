import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminNote, AdminNotesResponse, NoteModerationStatus } from '../models/note-admin.model';

@Injectable({ providedIn: 'root' })
export class NotesAdminService {
  private readonly url = `${environment.apiUrl}/notes`;

  constructor(private http: HttpClient) {}

  list(status: NoteModerationStatus, limit = 50, skip = 0): Observable<AdminNotesResponse> {
    return this.http.get<AdminNotesResponse>(
      `${this.url}/admin/list?status=${status}&limit=${limit}&skip=${skip}`,
    );
  }

  approve(noteId: string): Observable<AdminNote> {
    return this.http.patch<AdminNote>(`${this.url}/${noteId}/approve`, {});
  }

  reject(noteId: string): Observable<AdminNote> {
    return this.http.patch<AdminNote>(`${this.url}/${noteId}/reject`, {});
  }

  markSpam(noteId: string): Observable<AdminNote> {
    return this.http.patch<AdminNote>(`${this.url}/${noteId}/spam`, {});
  }

  remove(noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${noteId}`);
  }
}
