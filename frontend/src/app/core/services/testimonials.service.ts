import { Injectable, Signal, signal } from '@angular/core';
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

  private readonly _hasPublic = signal(false);
  private hasPublicRequested = false;

  constructor(private http: HttpClient) {}

  /**
   * true quando c'è almeno una testimonianza pubblicata. Finché sono zero la
   * voce "Testimonianze" resta fuori da menu e ricerca, la sezione della home
   * non c'è e la pagina /testimonials è noindex (vedi anche la sitemap).
   * Una sola richiesta per sessione: nell'HTML prerenderizzato la risposta
   * arriva già con il transfer cache, quindi niente salto del menu.
   */
  hasPublic(): Signal<boolean> {
    if (!this.hasPublicRequested) {
      this.hasPublicRequested = true;
      this.list(1, 0).subscribe({
        next: (res) => this._hasPublic.set((res.total ?? res.data.length) > 0),
        error: () => this._hasPublic.set(false),
      });
    }
    return this._hasPublic.asReadonly();
  }

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
