import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_CHAT_LIST_REFRESH_MS, LiveChatListComponent } from './live-chat-list.component';
import { LiveHandoffHistoryEntry } from './live-chat-list.util';
import { AdminNotification, AdminNotificationsService } from '../../../core/services/admin-notifications.service';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiUrl}/admin/live-handoff/recent`;

function entry(status: LiveHandoffHistoryEntry['status'], id: string, extra: Partial<LiveHandoffHistoryEntry> = {}): LiveHandoffHistoryEntry {
  return {
    requestId: id, sessionId: `s-${id}`, status, lastUserMessage: `msg ${id}`, locale: 'it',
    requestedAt: '2026-10-18T10:00:00Z', expiresAt: '2026-10-18T10:15:00Z', respondedAt: null, closedAt: null, ...extra,
  };
}

function setup(recent: AdminNotification[] = []) {
  const recentSig = signal<AdminNotification[]>(recent);
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AdminNotificationsService, useValue: { recent: recentSig } },
    ],
  });
  const fixture = TestBed.createComponent(LiveChatListComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el, recentSig };
}

describe('LiveChatListComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('mostra le aperte e le passate in due sezioni, con link alla sessione', () => {
    const { fixture, http, el } = setup();
    http.expectOne(URL).flush([
      entry('closed', 'c', { respondedAt: '2026-10-18T10:05:00Z' }),
      entry('requested', 'r'),
      entry('expired', 'e'),
    ]);
    fixture.detectChanges();

    const [open, past] = Array.from(el.querySelectorAll('.lcl-section'));
    expect(open.querySelectorAll('.lcl-item')).toHaveLength(1);
    expect(open.querySelector('.lcl-item')?.classList).toContain('lcl-item--waiting');
    expect(open.querySelector('a')?.getAttribute('href')).toBe('/dashboard/live-chat/s-r');
    expect(open.querySelector('a')?.textContent).toContain('live_handoff.card_open');

    expect(past.querySelectorAll('.lcl-item')).toHaveLength(2);
    expect(past.querySelector('a')?.textContent).toContain('live_handoff.list_reopen');
    expect(past.textContent).toContain('live_handoff.list_responded_in');
  });

  it('mostra i messaggi vuoti per sezione', () => {
    const { fixture, http, el } = setup();
    http.expectOne(URL).flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('live_handoff.card_empty');
    expect(el.textContent).toContain('live_handoff.list_past_empty');
  });

  it('su errore avvisa ma tiene le righe già caricate', () => {
    const { fixture, http, el } = setup();
    http.expectOne(URL).flush([entry('live', 'l')]);
    fixture.detectChanges();

    fixture.componentInstance.load();
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('.lcl-error')).not.toBeNull();
    expect(el.querySelectorAll('.lcl-item')).toHaveLength(1);
  });

  it('ricarica quando arriva una nuova richiesta di chat live, non per altri eventi', () => {
    const { fixture, http, recentSig } = setup([{ type: 'live_handoff', at: '2026-10-18T09:00:00Z' }]);
    http.expectOne(URL).flush([]);

    recentSig.set([{ type: 'contact', at: '2026-10-18T10:00:00Z' }]);
    fixture.detectChanges();
    http.expectNone(URL);

    recentSig.set([{ type: 'live_handoff', at: '2026-10-18T10:01:00Z' }]);
    fixture.detectChanges();
    http.expectOne(URL).flush([]);
    http.verify();
  });

  it('si aggiorna da sola ogni minuto (scadenze e chiusure le fa un cron, senza eventi)', () => {
    vi.useFakeTimers();
    const { http } = setup();
    http.expectOne(URL).flush([]);
    vi.advanceTimersByTime(LIVE_CHAT_LIST_REFRESH_MS);
    http.expectOne(URL).flush([]);
  });
});
