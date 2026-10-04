import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INACTIVITY_TIMEOUTS_MS, InactivityService, LAST_ACTIVITY_KEY } from './inactivity.service';
import { AuthService } from './auth.service';
import { AuthModalService } from './auth-modal.service';

function setup(opts: { loggedIn: boolean; admin: boolean }) {
  const loggedIn = signal(opts.loggedIn);
  const admin = signal(opts.admin);
  const auth = { isLoggedIn: loggedIn, isAdmin: admin, logout: vi.fn(() => loggedIn.set(false)) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: AuthModalService, useValue: { closeAll: vi.fn(), closeLogin: vi.fn() } },
    ],
  });
  const service = TestBed.inject(InactivityService);
  service.init();
  TestBed.tick();
  return { service, auth, loggedIn };
}

describe('InactivityService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('uses a per-role timeout: 15 min for admins, 30 min for users', () => {
    expect(setup({ loggedIn: true, admin: true }).service.timeoutMs()).toBe(INACTIVITY_TIMEOUTS_MS.admin);
    TestBed.resetTestingModule();
    expect(setup({ loggedIn: true, admin: false }).service.timeoutMs()).toBe(INACTIVITY_TIMEOUTS_MS.user);
  });

  it('now also tracks plain users and warns them before logging out (they were logged out silently before)', () => {
    const { service, auth } = setup({ loggedIn: true, admin: false });

    vi.advanceTimersByTime(INACTIVITY_TIMEOUTS_MS.user - service.warningMs + 10);
    expect(service.warningVisible()).toBe(true);
    expect(auth.logout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(service.warningMs);
    // Utente 'user': sessione persa sul posto, nessun redirect forzato al login admin.
    expect(auth.logout).toHaveBeenCalledWith(undefined);
  });

  it('sends an idle admin back to the admin login', () => {
    const { auth } = setup({ loggedIn: true, admin: true });
    vi.advanceTimersByTime(INACTIVITY_TIMEOUTS_MS.admin + 10);
    expect(auth.logout).toHaveBeenCalledWith('/dashboard/login');
  });

  it('activity postpones the timeout', () => {
    const { service, auth } = setup({ loggedIn: true, admin: true });
    vi.advanceTimersByTime(INACTIVITY_TIMEOUTS_MS.admin - 60_000);
    document.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(120_000);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(service.warningVisible()).toBe(false);
  });

  it('throttles activity: a burst of mousemove events writes localStorage at most ~once per second', () => {
    setup({ loggedIn: true, admin: false });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    for (let i = 0; i < 200; i++) {
      document.dispatchEvent(new Event('mousemove'));
      vi.advanceTimersByTime(5); // 200 eventi in 1 secondo
    }
    vi.advanceTimersByTime(1000);
    const writes = setItem.mock.calls.filter(([k]) => k === LAST_ACTIVITY_KEY).length;
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThanOrEqual(2); // leading + trailing
    setItem.mockRestore();
  });

  it('does nothing for anonymous visitors', () => {
    const { service, auth } = setup({ loggedIn: false, admin: false });
    vi.advanceTimersByTime(INACTIVITY_TIMEOUTS_MS.user * 2);
    expect(service.warningVisible()).toBe(false);
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
