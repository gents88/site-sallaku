import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NewsletterCounts, NewsletterStatus, NewsletterSubscribersResponse } from '../models/newsletter.model';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export interface NewsletterCampaign {
  _id: string;
  subject: string;
  html: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  testSentAt: string | null;
  stats: { total: number; sent: number; failed: number };
  createdAt: string;
}

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

  // ── Campagne ─────────────────────────────────────────────────────────────

  listCampaigns(): Observable<NewsletterCampaign[]> {
    return this.http.get<NewsletterCampaign[]>(`${this.url}/admin/campaigns`);
  }

  createCampaign(body: { subject: string; html: string }): Observable<NewsletterCampaign> {
    return this.http.post<NewsletterCampaign>(`${this.url}/admin/campaigns`, body);
  }

  updateCampaign(id: string, body: { subject: string; html: string }): Observable<NewsletterCampaign> {
    return this.http.put<NewsletterCampaign>(`${this.url}/admin/campaigns/${id}`, body);
  }

  deleteCampaign(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/admin/campaigns/${id}`);
  }

  testCampaign(id: string, email: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.url}/admin/campaigns/${id}/test`, { email });
  }

  sendCampaign(id: string, scheduledAt?: string): Observable<NewsletterCampaign> {
    return this.http.post<NewsletterCampaign>(`${this.url}/admin/campaigns/${id}/send`, scheduledAt ? { scheduledAt } : {});
  }

  cancelCampaign(id: string): Observable<NewsletterCampaign> {
    return this.http.post<NewsletterCampaign>(`${this.url}/admin/campaigns/${id}/cancel`, {});
  }
}
