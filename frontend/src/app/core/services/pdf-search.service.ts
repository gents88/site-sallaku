import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, finalize, catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

export type PdfSource = 'internet_archive';

export interface PdfSearchResult {
  id: string;
  title: string;
  author: string;
  year: string;
  source: PdfSource;
  sourceLabel: string;
  pdfUrl: string;
  coverUrl: string | null;
  detailsUrl: string;
}

@Injectable({ providedIn: 'root' })
export class PdfSearchService {
  private readonly api = `${environment.apiUrl}/pdf-search`;
  private readonly http = inject(HttpClient);

  readonly isLoading = signal<boolean>(false);

  search(query: string): Observable<PdfSearchResult[]> {
    this.isLoading.set(true);
    return this.http
      .get<{ results: PdfSearchResult[] }>(this.api, { params: { q: query } })
      .pipe(
        map((res) => res.results),
        finalize(() => this.isLoading.set(false)),
        catchError((err) => throwError(() => err)),
      );
  }
}
