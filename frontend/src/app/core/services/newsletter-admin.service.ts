import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NewsletterCounts, NewsletterStatus, NewsletterSubscribersResponse } from '../models/newsletter.model';

@Injectable({ providedIn: 'root' })
export class NewsletterAdminService {
  private readonly url = `${environment.apiUrl}/newsletter`;

  constructor(private http: HttpClient) {}

  list(page = 1, limit = 20, status?: NewsletterStatus): Observable<NewsletterSubscribersResponse> {
    let params = `page=${page}&limit=${limit}`;
    if (status) params += `&status=${status}`;
    return this.http.get<NewsletterSubscribersResponse>(`${this.url}/admin/subscribers?${params}`);
  }

  counts(): Observable<NewsletterCounts> {
    return this.http.get<NewsletterCounts>(`${this.url}/admin/counts`);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/admin/subscribers/${id}`);
  }

  /** Authenticated CSV download — the auth interceptor attaches the Bearer token, so this can't be a plain `<a href>`. */
  exportCsv(): Observable<Blob> {
    return this.http.get(`${this.url}/admin/export`, { responseType: 'blob' });
  }
}
