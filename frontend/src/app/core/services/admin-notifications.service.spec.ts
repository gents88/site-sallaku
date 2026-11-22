import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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

/** Esaurisce le promise in sospeso (la factory carica socket.io in modo asincrono). */
const flush = () => new Promise<void>(resolve => setTimeout(resolve));

async function setup(admin: boolean, load?: Promise<ReturnType<typeof fakeSocket>>) {
  document.title = 'Dashboard';
  const loggedIn = signal(admin);
  const isAdmin = signal(admin);
  const socket = fakeSocket();
  const factory = vi.fn(() => load ?? Promise.resolve(socket));
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: loggedIn, isAdmin, getToken: () => 'jwt', getFreshToken: () => of('jwt') } },
      { provide: ADMIN_SOCKET_FACTORY, useValue: factory },
    ],
  });
  const service = TestBed.inject(AdminNotificationsService);
  const http = TestBed.inject(HttpTestingController);
  service.init();
  TestBed.tick();
  await flush();
  return { service, http, socket, factory, loggedIn };
}

const summaryUrl = `${environment.apiUrl}/stats/notifications`;

describe('AdminNotificationsService', () => {
  it('does nothing for non-admins', async () => {
    const { factory, http } = await setup(false);
    expect(factory).not.toHaveBeenCalled();
    http.expectNone(summaryUrl);
  });

  it('loads the counters and connects with the token at handshake for admins', async () => {
    const { service, factory, http } = await setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 2, testimonialsPending: 1, notesPending: 0, liveHandoffsWaiting: 1 });
    expect(factory).toHaveBeenCalledWith(expect.stringMatching(/\/live-chat$/), { auth: expect.any(Function) });
    // L'handshake riceve il token al momento della connessione, non uno fissato all'apertura.
    const opts = (factory.mock.calls[0] as unknown as [string, { auth: (cb: (d: object) => void) => void }])[1];
    const cb = vi.fn();
    opts.auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: 'jwt' });
    expect(service.total()).toBe(4);
    TestBed.tick();
    expect(document.title).toBe('(4) Dashboard');
  });

  it('records a live event and refreshes the counters', async () => {
    const { service, socket, http } = await setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    socket.fire('admin_notification', { type: 'live_handoff', at: '2026-10-04T10:00:00Z', title: 'Ciao' });
    expect(service.recent()[0].type).toBe('live_handoff');
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 1 });
    expect(service.total()).toBe(1);
  });

  it('disconnects and clears everything on logout', async () => {
    const { service, socket, http, loggedIn } = await setup(true);
    http.expectOne(summaryUrl).flush({ contactsUnread: 3, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    loggedIn.set(false);
    TestBed.tick();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(service.total()).toBe(0);
    expect(document.title).toBe('Dashboard');
  });

  it('closes a socket that finishes loading after the logout, without listening to it', async () => {
    let resolve!: (s: ReturnType<typeof fakeSocket>) => void;
    const late = fakeSocket();
    const { service, http, loggedIn } = await setup(true, new Promise(r => { resolve = r; }));
    http.expectOne(summaryUrl).flush({ contactsUnread: 1, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    loggedIn.set(false);
    TestBed.tick();
    resolve(late);
    await flush();
    expect(late.disconnect).toHaveBeenCalled();
    expect(late.on).not.toHaveBeenCalled();
    expect(service.connected()).toBe(false);
  });

  it('does not open a second connection while socket.io is still loading', async () => {
    const { factory, http, service } = await setup(true, new Promise(() => { /* mai pronto */ }));
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    (service as unknown as { start(): void }).start();
    http.expectOne(summaryUrl).flush({ contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
