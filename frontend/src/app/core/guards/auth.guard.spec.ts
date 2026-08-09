import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

function runGuard() {
  return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
}

describe('authGuard', () => {
  it('allows navigation when the user is logged in and is an admin', () => {
    const urlTree = {} as UrlTree;
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => true, isAdmin: () => true } },
        { provide: Router, useValue: { createUrlTree: vi.fn().mockReturnValue(urlTree) } },
      ],
    });

    expect(runGuard()).toBe(true);
  });

  it('redirects to the dashboard login when the user is not logged in', () => {
    const urlTree = {} as UrlTree;
    const createUrlTree = vi.fn().mockReturnValue(urlTree);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => false, isAdmin: () => false } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    expect(runGuard()).toBe(urlTree);
    expect(createUrlTree).toHaveBeenCalledWith(['/dashboard/login']);
  });

  it('redirects to the dashboard login when the user is logged in but not an admin', () => {
    const urlTree = {} as UrlTree;
    const createUrlTree = vi.fn().mockReturnValue(urlTree);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isLoggedIn: () => true, isAdmin: () => false } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    expect(runGuard()).toBe(urlTree);
    expect(createUrlTree).toHaveBeenCalledWith(['/dashboard/login']);
  });
});
