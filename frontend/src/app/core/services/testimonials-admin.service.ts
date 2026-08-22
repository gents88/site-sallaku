import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminTestimonial,
  AdminTestimonialsResponse,
  TestimonialModerationStatus,
} from '../models/testimonial-admin.model';

@Injectable({ providedIn: 'root' })
export class TestimonialsAdminService {
  private readonly url = `${environment.apiUrl}/testimonials`;

  constructor(private http: HttpClient) {}

  list(
    status: TestimonialModerationStatus,
    limit = 50,
    skip = 0,
  ): Observable<AdminTestimonialsResponse> {
    return this.http.get<AdminTestimonialsResponse>(
      `${this.url}/admin/list?status=${status}&limit=${limit}&skip=${skip}`,
    );
  }

  approve(id: string): Observable<AdminTestimonial> {
    return this.http.patch<AdminTestimonial>(`${this.url}/${id}/approve`, {});
  }

  reject(id: string): Observable<AdminTestimonial> {
    return this.http.patch<AdminTestimonial>(`${this.url}/${id}/reject`, {});
  }

  markSpam(id: string): Observable<AdminTestimonial> {
    return this.http.patch<AdminTestimonial>(`${this.url}/${id}/spam`, {});
  }

  setFeatured(id: string, featured: boolean): Observable<AdminTestimonial> {
    return this.http.patch<AdminTestimonial>(`${this.url}/${id}/feature`, { featured });
  }

  updateContent(id: string, content: string): Observable<AdminTestimonial> {
    return this.http.patch<AdminTestimonial>(`${this.url}/${id}/content`, { content });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
