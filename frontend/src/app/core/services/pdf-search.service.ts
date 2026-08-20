import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, finalize, catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

export type PdfSource = 'internet_archive' | 'gutenberg' | 'arxiv' | 'pmc';

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
  /** False when the source blocks iframe embedding outright (e.g. PMC) — show a download-only state instead of an iframe. */
  previewable: boolean;
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

  /**
   * Fetches a result's PDF bytes for handoff to the Workspace tool. Gutenberg
   * results already point at our own backend (CORS already open to this
   * frontend), but Internet Archive/arXiv/PMC don't send
   * Access-Control-Allow-Origin on the file itself — those go through our
   * `/pdf-search/proxy` relay instead, which does.
   */
  downloadBlob(result: PdfSearchResult): Observable<Blob> {
    const url = result.source === 'gutenberg'
      ? result.pdfUrl
      : `${this.api}/proxy?url=${encodeURIComponent(result.pdfUrl)}`;
    return this.http.get(url, { responseType: 'blob' });
  }
}
