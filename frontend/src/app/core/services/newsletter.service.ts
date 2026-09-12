import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NewsletterActionResponse, NewsletterTokenResponse } from '../models/newsletter.model';

@Injectable({ providedIn: 'root' })
export class NewsletterService {
  private readonly url = `${environment.apiUrl}/newsletter`;

  constructor(private http: HttpClient) {}

  subscribe(email: string, website?: string, turnstileToken?: string): Observable<NewsletterActionResponse> {
    return this.http.post<NewsletterActionResponse>(`${this.url}/subscribe`, { email, website, turnstileToken });
  }

  confirm(token: string): Observable<NewsletterTokenResponse> {
    return this.http.get<NewsletterTokenResponse>(`${this.url}/confirm`, { params: { token } });
  }

  unsubscribe(token: string): Observable<NewsletterTokenResponse> {
    return this.http.get<NewsletterTokenResponse>(`${this.url}/unsubscribe`, { params: { token } });
  }
}
