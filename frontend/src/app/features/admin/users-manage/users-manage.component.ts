import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AdminUser, UserRole, UsersAdminService } from '../../../core/services/users-admin.service';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Gestione utenti: elenco con ricerca/filtro ruolo, cambio ruolo ed
 * eliminazione. Il backend impedisce di modificare sé stessi e di togliere
 * l'ultimo admin; qui la propria riga è già disabilitata, e gli errori del
 * server (es. "ultimo admin") vengono mostrati invece di essere ignorati.
 */
@Component({
  selector: 'app-users-manage',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslateModule],
  templateUrl: './users-manage.component.html',
  styleUrl: './users-manage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersManageComponent {
  private readonly api = inject(UsersAdminService);
  private readonly auth = inject(AuthService);
  private readonly t = inject(TranslateService);

  readonly limit = 20;
  readonly page = signal(1);
  readonly role = signal<UserRole | ''>('');
  readonly search = signal('');
  readonly query = signal('');

  readonly users = signal<AdminUser[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly currentUserId = computed(() => this.auth.currentUser()?._id ?? null);

  private loadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => this.load(this.page(), this.role(), this.query()));
    inject(DestroyRef).onDestroy(() => {
      this.loadSub?.unsubscribe();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  isSelf(user: AdminUser): boolean {
    return user._id === this.currentUserId();
  }

  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.query.set(value.trim());
    }, 300);
  }

  setRoleFilter(role: UserRole | ''): void {
    this.page.set(1);
    this.role.set(role);
  }

  goTo(page: number): void {
    if (page >= 1 && page <= this.totalPages()) this.page.set(page);
  }

  reload(): void {
    this.load(this.page(), this.role(), this.query());
  }

  changeRole(user: AdminUser, role: UserRole): void {
    if (this.isSelf(user) || role === user.role) return;
    if (!confirm(this.t.instant('users_manage.confirm_role', { name: user.name, role }))) {
      this.users.update(list => [...list]); // ripristina la select sul valore corrente
      return;
    }
    this.busyId.set(user._id);
    this.errorMessage.set(null);
    this.api.updateRole(user._id, role).subscribe({
      next: res => {
        this.busyId.set(null);
        this.users.update(list => list.map(u => (u._id === user._id ? { ...u, role: res.role } : u)));
      },
      error: err => {
        this.busyId.set(null);
        this.users.update(list => [...list]);
        this.errorMessage.set(this.serverMessage(err));
      },
    });
  }

  remove(user: AdminUser): void {
    if (this.isSelf(user) || !confirm(this.t.instant('users_manage.confirm_delete', { name: user.name }))) return;
    this.busyId.set(user._id);
    this.errorMessage.set(null);
    this.api.remove(user._id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.reload();
      },
      error: err => {
        this.busyId.set(null);
        this.errorMessage.set(this.serverMessage(err));
      },
    });
  }

  private serverMessage(err: { error?: { message?: string | string[] } }): string {
    const msg = err?.error?.message;
    return (Array.isArray(msg) ? msg.join(' ') : msg) || this.t.instant('users_manage.action_error');
  }

  private load(page: number, role: UserRole | '', q: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.list({ page, limit: this.limit, role, q }).subscribe({
      next: res => {
        this.users.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(Math.max(res.totalPages, 1));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }
}
