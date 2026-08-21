import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Testimonial,
  TestimonialsResponse,
  CreateTestimonialPayload,
} from '../models/testimonial.model';

@Injectable({ providedIn: 'root' })
export class TestimonialsService {
  private readonly url = `${environment.apiUrl}/testimonials`;

  constructor(private http: HttpClient) {}

  list(limit = 20, skip = 0): Observable<TestimonialsResponse> {
    return this.http
      .get<TestimonialsResponse>(`${this.url}?limit=${limit}&skip=${skip}`)
      .pipe(timeout(15000));
  }

  getFeatured(limit = 6): Observable<Testimonial[]> {
    return this.http
      .get<Testimonial[]>(`${this.url}/featured?limit=${limit}`)
      .pipe(timeout(15000));
  }

  create(payload: CreateTestimonialPayload): Observable<Testimonial> {
    return this.http.post<Testimonial>(this.url, payload).pipe(timeout(15000));
  }
}
