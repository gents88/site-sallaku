import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AdminUser, PASSWORD_PATTERN, PHONE_PATTERN, UserRole, UsersAdminService } from '../../../core/services/users-admin.service';
import { AuthService } from '../../../core/services/auth.service';

interface UserForm {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  emailVerified: boolean;
  password: string;
}

const EMPTY_FORM: UserForm = { name: '', email: '', phone: '', role: 'user', emailVerified: true, password: '' };

/**
 * Gestione utenti: elenco con ricerca/filtro ruolo, creazione, modifica,
 * cambio ruolo, reimpostazione password, disconnessione ed eliminazione. Il backend impedisce di modificare sé stessi e di togliere
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

  /** Editor: null = chiuso; senza `id` = nuovo utente. */
  readonly editor = signal<{ id?: string } | null>(null);
  readonly form = signal<UserForm>({ ...EMPTY_FORM });
  readonly formErrors = signal<string[]>([]);
  readonly saving = signal(false);

  /** Dialog "reimposta password". */
  readonly passwordFor = signal<AdminUser | null>(null);
  readonly newPassword = signal('');
  readonly notice = signal<string | null>(null);

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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.passwordFor()) this.passwordFor.set(null);
    else if (this.editor()) this.editor.set(null);
  }

  // ── Creazione / modifica ────────────────────────────────────────────────

  openCreate(): void {
    this.form.set({ ...EMPTY_FORM });
    this.formErrors.set([]);
    this.editor.set({});
  }

  openEdit(user: AdminUser): void {
    this.form.set({
      name: user.name, email: user.email ?? '', phone: user.phone ?? '', role: user.role,
      emailVerified: user.emailVerified, password: '',
    });
    this.formErrors.set([]);
    this.editor.set({ id: user._id });
  }

  closeEditor(): void {
    this.editor.set(null);
  }

  patchForm(patch: Partial<UserForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  /** Stesse regole del backend, così l'errore arriva prima dell'invio. */
  validate(form: UserForm, creating: boolean): string[] {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push('users_manage.err_name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.push('users_manage.err_email');
    if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) errors.push('users_manage.err_phone');
    if (creating && form.password && !PASSWORD_PATTERN.test(form.password)) errors.push('users_manage.err_password');
    return errors;
  }

  saveUser(): void {
    const ed = this.editor();
    if (!ed || this.saving()) return;
    const f = this.form();
    const creating = !ed.id;
    const errors = this.validate(f, creating);
    this.formErrors.set(errors);
    if (errors.length) return;

    const base = { name: f.name.trim(), email: f.email.trim(), emailVerified: f.emailVerified };
    const req$ = creating
      ? this.api.create({ ...base, role: f.role, ...(f.phone.trim() ? { phone: f.phone.trim() } : {}), ...(f.password ? { password: f.password } : {}) })
      : this.api.update(ed.id!, { ...base, phone: f.phone.trim() });

    this.saving.set(true);
    this.errorMessage.set(null);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.editor.set(null);
        this.notice.set(this.t.instant(creating ? 'users_manage.created' : 'users_manage.updated'));
        this.reload();
      },
      error: err => {
        this.saving.set(false);
        this.errorMessage.set(this.serverMessage(err));
      },
    });
  }

  // ── Password e sessioni ─────────────────────────────────────────────────

  openPassword(user: AdminUser): void {
    this.newPassword.set('');
    this.formErrors.set([]);
    this.passwordFor.set(user);
  }

  savePassword(): void {
    const user = this.passwordFor();
    if (!user) return;
    if (!PASSWORD_PATTERN.test(this.newPassword())) {
      this.formErrors.set(['users_manage.err_password']);
      return;
    }
    this.busyId.set(user._id);
    this.api.setPassword(user._id, this.newPassword()).subscribe({
      next: () => {
        this.busyId.set(null);
        this.passwordFor.set(null);
        this.notice.set(this.t.instant('users_manage.password_set', { name: user.name }));
      },
      error: err => {
        this.busyId.set(null);
        this.errorMessage.set(this.serverMessage(err));
      },
    });
  }

  revokeSessions(user: AdminUser): void {
    if (this.isSelf(user) || !confirm(this.t.instant('users_manage.confirm_revoke', { name: user.name }))) return;
    this.busyId.set(user._id);
    this.api.revokeSessions(user._id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notice.set(this.t.instant('users_manage.sessions_revoked', { name: user.name }));
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
