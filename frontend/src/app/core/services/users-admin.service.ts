import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type UserRole = 'admin' | 'user';

export interface AdminUser {
  _id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserFormValue {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  emailVerified: boolean;
}

/** Stessa regola del backend (auth/password-policy.ts): 8+ caratteri, maiuscola, minuscola, cifra, simbolo. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,72}$/;
export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export interface AdminUsersPage {
  data: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}

/** Gestione utenti (/dashboard/users) → /api/v1/admin/users, solo admin. */
@Injectable({ providedIn: 'root' })
export class UsersAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/users`;

  list(opts: { page: number; limit: number; q?: string; role?: UserRole | '' }): Observable<AdminUsersPage> {
    let params = new HttpParams().set('page', opts.page).set('limit', opts.limit);
    if (opts.q?.trim()) params = params.set('q', opts.q.trim());
    if (opts.role) params = params.set('role', opts.role);
    return this.http.get<AdminUsersPage>(this.url, { params });
  }

  updateRole(id: string, role: UserRole): Observable<{ _id: string; role: UserRole }> {
    return this.http.patch<{ _id: string; role: UserRole }>(`${this.url}/${id}/role`, { role });
  }

  create(body: UserFormValue & { password?: string }): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.url, body);
  }

  update(id: string, body: Partial<Omit<UserFormValue, 'role'>>): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.url}/${id}`, body);
  }

  setPassword(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/password`, { password });
  }

  revokeSessions(id: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/revoke-sessions`, {});
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
