import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { About, UpdateAboutPayload } from '../models/about.model';

@Injectable({ providedIn: 'root' })
export class AboutService {
  private readonly url = `${environment.apiUrl}/about`;
  constructor(private http: HttpClient) {}

  get(): Observable<About> { return this.http.get<About>(this.url); }
  update(payload: UpdateAboutPayload): Observable<About> { return this.http.put<About>(this.url, payload); }
}
