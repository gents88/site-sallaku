import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

export type DocType = 'general' | 'business_proposal' | 'report' | 'meeting_notes' | 'resume' | 'article';

interface FormatTextRequest {
  text: string;
  docType?: DocType;
}

export interface FormatTextResult {
  formatted: string;
  wordCount: number;
  sections: number;
  summary: string;
  processingTime: number;
}

@Injectable({ providedIn: 'root' })
export class AiFormatterService {
  private readonly api = `${environment.apiUrl}/ai`;
  private readonly http = inject(HttpClient);

  readonly isLoading = signal<boolean>(false);

  formatText(payload: FormatTextRequest): Observable<FormatTextResult> {
    this.isLoading.set(true);
    return this.http
      .post<FormatTextResult>(`${this.api}/format-text`, payload)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => throwError(() => err)),
      );
  }
}
