import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UploadEvent, asUploadEvents } from '../http/upload-events';
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
  truncated: boolean;
  processingTime: number;
}

@Injectable({ providedIn: 'root' })
export class AiFormatterService {
  private readonly api = `${environment.apiUrl}/ai`;
  private readonly http = inject(HttpClient);

  /** Lo stato di caricamento vive nel componente (TrackedRequest), così la richiesta è annullabile. */
  formatText(payload: FormatTextRequest): Observable<UploadEvent<FormatTextResult>> {
    return this.http
      .post<FormatTextResult>(`${this.api}/format-text`, payload)
      .pipe(asUploadEvents<FormatTextResult>());
  }
}
