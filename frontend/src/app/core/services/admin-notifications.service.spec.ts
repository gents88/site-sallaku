import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_SOCKET_FACTORY, AdminNotificationsService } from './admin-notifications.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

function fakeSocket() {
  const handlers: Record<string, (arg?: unknown) => void> = {};
  return {
    on: vi.fn((ev: string, cb: (arg?: unknown) => void) => { handlers[ev] = cb; }),
    disconnect: vi.fn(),
    fire: (ev: string, arg?: unknown) => handlers[ev]?.(arg),
  };
}

function setup(admin: boolean) {
  document.title = 'Dashboard';
  const loggedIn = signal(admin);
  const isAdmin = signal(admin);
  const socket = fakeSocket();
  const factory = vi.fn(() => socket);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: loggedIn, isAdmin, getToken: () => 'jwt' } },
      { provide: ADMIN_SOCKET_FACTORY, useValue: factory },
    ],
  });
  const service = TestBed.inject(AdminNotificationsService);
  const http = TestBed.inject(HttpTestingController);
  service.init();
  TestBed.tick();
  return { service, http, socket, factory, loggedIn };
}

const summaryUrl = `${environment.apiUrl}/stats/notifications`;

describe('AdminNotificationsService', () => {
  it('does nothing for non-admins', () => {
    const { factory, http } = setup(false);
    expect(factory).not.toHaveBeenCalled();
    http.expectNone(summaryUrl);
  });

  it('loads the counters and connects with the token at handshake for admins', () => {
    const { service, factory, http } = setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 2, testimonialsPending: 1, notesPending: 0, liveHandoffsWaiting: 1 });
    expect(factory).toHaveBeenCalledWith(expect.stringMatching(/\/live-chat$/), { auth: { token: 'jwt' } });
    expect(service.total()).toBe(4);
    TestBed.tick();
    expect(document.title).toBe('(4) Dashboard');
  });

  it('records a live event and refreshes the counters', () => {
    const { service, socket, http } = setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    socket.fire('admin_notification', { type: 'live_handoff', at: '2026-10-04T10:00:00Z', title: 'Ciao' });
    expect(service.recent()[0].type).toBe('live_handoff');
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 1 });
    expect(service.total()).toBe(1);
  });

  it('disconnects and clears everything on logout', () => {
    const { service, socket, http, loggedIn } = setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 3, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    loggedIn.set(false);
    TestBed.tick();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(service.total()).toBe(0);
    expect(document.title).toBe('Dashboard');
  });
});
