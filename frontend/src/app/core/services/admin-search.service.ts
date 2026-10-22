import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AdminSearchHitType = 'contact' | 'user' | 'draft' | 'note';

export interface AdminSearchHit {
  id: string;
  type: AdminSearchHitType;
  title: string;
  detail: string;
  /** Pagina admin che mostra l'elemento (con query string). */
  url: string;
}

/** Ricerca trasversale (contatti, utenti, bozze, note) per la palette Ctrl+K dell'admin. */
@Injectable({ providedIn: 'root' })
export class AdminSearchService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/search`;

  search(q: string): Observable<AdminSearchHit[]> {
    return this.http.get<AdminSearchHit[]>(this.url, { params: new HttpParams().set('q', q) });
  }
}
