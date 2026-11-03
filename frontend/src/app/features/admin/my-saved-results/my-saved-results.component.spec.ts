import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MySavedResultsComponent } from './my-saved-results.component';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';
import { SavedResultsService } from '../../../core/services/saved-results.service';
import { SnackbarService } from '../../../core/services/snackbar.service';
import { LanguageService } from '../../../core/services/language.service';

function setup(opts: { admin?: boolean; hasPassword?: boolean; deleteStatus?: number } = {}) {
  const user = signal({ _id: 'u1', name: 'Ada', email: 'ada@example.com', role: opts.admin ? 'admin' : 'user' });
  const auth = {
    isLoggedIn: signal(true),
    isAdmin: computed(() => user().role === 'admin'),
    currentUser: user,
    accountHasPassword: vi.fn(() => of(opts.hasPassword ?? true)),
    deleteAccount: vi.fn(() => (opts.deleteStatus ? throwError(() => ({ status: opts.deleteStatus })) : of(undefined))),
  };
  const snackbar = { show: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MySavedResultsComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: AuthModalService, useValue: { openLogin: vi.fn() } },
      { provide: SavedResultsService, useValue: { list: () => of({ data: [] }) } },
      { provide: SnackbarService, useValue: snackbar },
      { provide: LanguageService, useValue: { current: () => 'en' } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(MySavedResultsComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (selector: string) => {
    (el.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };
  const type = (value: string) => {
    const input = el.querySelector('#delete-password') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { el, auth, snackbar, navigate, click, type };
}

describe('MySavedResultsComponent — cancellazione dell\'account', () => {
  it('chiede la password e non parte finché non è scritta', () => {
    const { el, click, type, auth } = setup();
    click('.btn-danger-outline');
    const confirm = el.querySelector('.btn-danger') as HTMLButtonElement;
    expect(el.querySelector('#delete-password')).not.toBeNull();
    expect(confirm.disabled).toBe(true);

    type('Segreta123!');
    expect(confirm.disabled).toBe(false);
    click('.btn-danger');
    expect(auth.deleteAccount).toHaveBeenCalledWith('Segreta123!');
  });

  it('account solo-OTP: niente campo password, si conferma e basta', () => {
    const { el, click, auth } = setup({ hasPassword: false });
    click('.btn-danger-outline');
    expect(el.querySelector('#delete-password')).toBeNull();
    click('.btn-danger');
    expect(auth.deleteAccount).toHaveBeenCalledWith(undefined);
  });

  it('dopo la cancellazione avvisa e torna alla home nella lingua corrente', () => {
    const { click, type, snackbar, navigate } = setup();
    click('.btn-danger-outline');
    type('Segreta123!');
    click('.btn-danger');
    expect(snackbar.show).toHaveBeenCalledWith('account.done', 'success');
    expect(navigate).toHaveBeenCalledWith('/en');
  });

  it('password sbagliata: messaggio in pagina, si resta sul pannello', () => {
    const { el, click, type, navigate } = setup({ deleteStatus: 400 });
    click('.btn-danger-outline');
    type('sbagliata');
    click('.btn-danger');
    expect(el.querySelector('.delete-error')?.textContent).toContain('account.wrong_password');
    expect(el.querySelector('.delete-confirm')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('l\'admin non vede la sezione (si gestisce da /dashboard/users)', () => {
    const { el } = setup({ admin: true });
    expect(el.querySelector('.account-box')).toBeNull();
  });
});
