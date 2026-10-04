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

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
