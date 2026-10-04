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
    expect(selfRow.querySelector('button')?.disabled).toBe(true);
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
});
