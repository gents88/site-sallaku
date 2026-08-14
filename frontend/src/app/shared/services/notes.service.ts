import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Note {
  id: string;
  articleId: string;
  name?: string;
  email?: string;
  content: string;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotesResponse {
  data: Note[];
  total: number;
}

export interface CreateNotePayload {
  name?: string;
  email?: string;
  content: string;
  website?: string;
  honeypot?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotesService {
  private apiUrl = `${environment.apiUrl}/notes`;
  private notesCache = new Map<string, BehaviorSubject<Note[]>>();

  constructor(private http: HttpClient) {}

  getNotes(articleId: string, limit: number = 50, skip: number = 0): Observable<NotesResponse> {
    return this.http.get<NotesResponse>(
      `${this.apiUrl}/${articleId}?limit=${limit}&skip=${skip}`,
    );
  }

  createNote(articleId: string, payload: CreateNotePayload): Observable<Note> {
    return this.http.post<Note>(`${this.apiUrl}/${articleId}`, payload).pipe(
      tap((note) => this.invalidateCache(articleId)),
      catchError((error) => {
        console.error('Error creating note:', error);
        throw error;
      }),
    );
  }

  getNotesCache(articleId: string): BehaviorSubject<Note[]> {
    if (!this.notesCache.has(articleId)) {
      this.notesCache.set(articleId, new BehaviorSubject<Note[]>([]));
    }
    return this.notesCache.get(articleId)!;
  }

  updateNotesCache(articleId: string, notes: Note[]): void {
    if (!this.notesCache.has(articleId)) {
      this.notesCache.set(articleId, new BehaviorSubject<Note[]>(notes));
    } else {
      this.notesCache.get(articleId)!.next(notes);
    }
  }

  addNoteToCache(articleId: string, note: Note): void {
    const cache = this.getNotesCache(articleId);
    const currentNotes = cache.value;
    cache.next([note, ...currentNotes]);
  }

  private invalidateCache(articleId: string): void {
    if (this.notesCache.has(articleId)) {
      this.notesCache.get(articleId)!.next([]);
    }
  }
}
