import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpLoginComponent } from './otp-login.component';
import { AuthService } from '../../../../core/services/auth.service';
import { LAST_LOGIN_ADMIN_KEY } from '../auth-form.utils';

describe('OtpLoginComponent', () => {
  let auth: {
    isAdmin: ReturnType<typeof vi.fn>;
    requestOtp: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    auth = {
      isAdmin: vi.fn(() => false),
      requestOtp: vi.fn(() => of({ message: 'ok' })),
      verifyOtp: vi.fn(() => of({})),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  function setup() {
    TestBed.configureTestingModule({
      imports: [OtpLoginComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideNoopAnimations(), { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(OtpLoginComponent);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  it('per chi arriva dalla registrazione o da un altro profilo: avatar generico, non la foto di Gent', () => {
    const avatar = setup().el.querySelector('.auth-avatar');
    expect(avatar?.querySelector('app-generic-avatar svg')).not.toBeNull();
    expect(avatar?.querySelector('img')).toBeNull();
  });

  it('se l\'ultimo accesso sul dispositivo è stato dell\'admin: la foto profilo', () => {
    localStorage.setItem(LAST_LOGIN_ADMIN_KEY, '1');
    const avatar = setup().el.querySelector('.auth-avatar');
    expect(avatar?.querySelector('img')?.getAttribute('src')).toBe('assets/profil-440.jpg');
    expect(avatar?.querySelector('app-generic-avatar')).toBeNull();
  });

  it('accesso col codice: ricorda se è stato l\'admin oppure no', () => {
    vi.useFakeTimers();
    const { cmp } = setup();
    cmp.identifier = 'admin@example.com';
    cmp.otpForm.setValue({ otp: '123456' });
    auth.isAdmin.mockReturnValue(true);
    cmp.verifyOtp();
    expect(localStorage.getItem(LAST_LOGIN_ADMIN_KEY)).toBe('1');

    auth.isAdmin.mockReturnValue(false);
    cmp.otpForm.setValue({ otp: '654321' });
    cmp.verifyOtp();
    expect(localStorage.getItem(LAST_LOGIN_ADMIN_KEY)).toBeNull();
  });
});
