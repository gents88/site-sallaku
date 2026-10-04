import { HttpClient, HttpHeaders, HttpXhrBackend } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UploadEvent, toUploadEvents } from './upload-events';

/**
 * POST multipart con avanzamento reale dell'upload.
 *
 * L'app usa provideHttpClient(withFetch()), e il FetchBackend di Angular non
 * emette mai HttpEventType.UploadProgress (fetch non espone l'upload): solo
 * HttpXhrBackend lo fa. Questo client usa quindi XHR solo per gli upload dei
 * tool del Lab; il resto dell'app resta su fetch. Non passa dagli interceptor
 * globali (endpoint pubblici, nessuna cache su POST): il bearer token, se
 * presente, viene aggiunto qui. Annullare la sottoscrizione fa xhr.abort().
 */
@Injectable({ providedIn: 'root' })
export class UploadClient {
  private readonly http = new HttpClient(inject(HttpXhrBackend));
  private readonly auth = inject(AuthService);

  post<T>(url: string, body: FormData): Observable<UploadEvent<T>> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http
      .post<T>(url, body, { headers, reportProgress: true, observe: 'events' })
      .pipe(toUploadEvents<T>());
  }
}
