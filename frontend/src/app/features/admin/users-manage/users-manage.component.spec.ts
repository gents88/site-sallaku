import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersManageComponent } from './users-manage.component';
import { AdminUser, UsersAdminService } from '../../../core/services/users-admin.service';
import { AuthService } from '../../../core/services/auth.service';

const users: AdminUser[] = [
  { _id: 'me', name: 'Gent', email: 'g@x.it', role: 'admin', emailVerified: true, createdAt: '2026-01-01' },
  { _id: 'u2', name: 'Anna', email: 'a@x.it', role: 'user', emailVerified: false, createdAt: '2026-02-01' },
];

function setup(api: Record<string, unknown> = {}) {
  const defaults = {
    list: vi.fn(() => of({ data: users, total: 2, page: 1, totalPages: 1 })),
    updateRole: vi.fn(() => of({ _id: 'u2', role: 'admin' })),
    remove: vi.fn(() => of(undefined)),
    create: vi.fn((_b: unknown) => of(users[1])),
    update: vi.fn((_id: string, _b: unknown) => of(users[1])),
    setPassword: vi.fn((_id: string, _p: string) => of(undefined)),
    revokeSessions: vi.fn((_id: string) => of(undefined)),
  };
  const service = Object.assign(defaults, api) as typeof defaults;
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: UsersAdminService, useValue: service },
      { provide: AuthService, useValue: { currentUser: signal({ _id: 'me', name: 'Gent', email: 'g@x.it', role: 'admin' }) } },
    ],
  });
  const fixture = TestBed.createComponent(UsersManageComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, service, el: fixture.nativeElement as HTMLElement };
}

describe('UsersManageComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('disables role and delete controls on your own row', async () => {
    const { el, fixture } = setup();
    // NgModel applica `disabled` in modo asincrono.
    await fixture.whenStable();
    fixture.detectChanges();
    const selfRow = el.querySelector('tr.is-self')!;
    expect(selfRow.querySelector('select')?.disabled).toBe(true);
    const buttons = Array.from(selfRow.querySelectorAll('button')).map(b => ({ label: b.textContent?.trim(), disabled: b.disabled }));
    // Modifica e Password restano disponibili sul proprio profilo; Disconnetti ed Elimina no.
    expect(buttons.map(b => b.disabled)).toEqual([false, false, true, true]);
  });

  it('changes a role only after confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { c, service } = setup();
    c.changeRole(users[1], 'admin');
    expect(service.updateRole).not.toHaveBeenCalled();
    c.changeRole(users[1], 'admin');
    expect(service.updateRole).toHaveBeenCalledWith('u2', 'admin');
    expect(c.users()[1].role).toBe('admin');
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('never acts on yourself, even if called directly', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { c, service } = setup();
    c.changeRole(users[0], 'user');
    c.remove(users[0]);
    expect(service.updateRole).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('shows the server reason when an action is refused (e.g. last admin)', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { c } = setup({ remove: vi.fn(() => throwError(() => ({ error: { message: 'At least one admin must remain' } }))) });
    c.remove(users[1]);
    expect(c.errorMessage()).toBe('At least one admin must remain');
  });

  it('creates a user with role and optional password, validating before sending', () => {
    const { c, service } = setup();
    c.openCreate();
    c.patchForm({ name: 'Marco', email: 'non-valida', role: 'admin', password: 'debole' });
    c.saveUser();
    expect(service.create).not.toHaveBeenCalled();
    expect(c.formErrors()).toEqual(['users_manage.err_email', 'users_manage.err_password']);

    c.patchForm({ email: 'marco@x.it', password: 'Forte#123' });
    c.saveUser();
    expect(service.create).toHaveBeenCalledWith({ name: 'Marco', email: 'marco@x.it', emailVerified: true, role: 'admin', password: 'Forte#123' });
    expect(c.editor()).toBeNull();
  });

  it('edits the profile without touching role or password', () => {
    const { c, service } = setup();
    c.openEdit(users[1]);
    c.patchForm({ name: 'Anna Bianchi', phone: '+393331234567' });
    c.saveUser();
    expect(service.update).toHaveBeenCalledWith('u2', { name: 'Anna Bianchi', email: 'a@x.it', emailVerified: false, phone: '+393331234567' });
  });

  it('resets a password only if it meets the policy', () => {
    const { c, service } = setup();
    c.openPassword(users[1]);
    c.newPassword.set('short');
    c.savePassword();
    expect(service.setPassword).not.toHaveBeenCalled();
    c.newPassword.set('Nuova#Pass1');
    c.savePassword();
    expect(service.setPassword).toHaveBeenCalledWith('u2', 'Nuova#Pass1');
    expect(c.passwordFor()).toBeNull();
  });

  it('logs another user out everywhere after confirmation, never yourself', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { c, service } = setup();
    c.revokeSessions(users[0]);
    expect(service.revokeSessions).not.toHaveBeenCalled();
    c.revokeSessions(users[1]);
    expect(service.revokeSessions).toHaveBeenCalledWith('u2');
  });
});
