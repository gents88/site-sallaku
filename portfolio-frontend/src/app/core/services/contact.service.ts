import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ContactPayload } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly url = `${environment.apiUrl}/contact`;
  constructor(private http: HttpClient) {}

  send(payload: ContactPayload): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(this.url, payload);
  }
}
