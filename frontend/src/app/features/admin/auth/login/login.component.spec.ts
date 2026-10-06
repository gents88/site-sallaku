import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../../core/services/auth.service';
import { AuthModalService } from '../../../../core/services/auth-modal.service';

describe('LoginComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: AuthService, useValue: { isLoggedIn: () => false, isAdmin: () => false } },
        { provide: AuthModalService, useValue: { closeLogin: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra la foto profilo nella card al posto delle iniziali', () => {
    const avatar = setup().querySelector('.auth-avatar');
    expect(avatar?.textContent?.trim()).toBe('');
    expect(avatar?.querySelector('img')?.getAttribute('src')).toBe('assets/profil-440.jpg');
    const sources = Array.from(avatar?.querySelectorAll('source') ?? []).map(s => s.getAttribute('type'));
    expect(sources).toEqual(['image/avif', 'image/webp']);
  });
});
