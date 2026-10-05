import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactsInboxComponent } from './contacts-inbox.component';
import { AdminDashboardService, RecentContact } from '../dashboard/admin-dashboard.service';

const msg = (id: string, read = false): RecentContact => ({ _id: id, name: 'Mario', email: 'm@x.it', subject: `Oggetto ${id}`, message: 'Ciao', createdAt: '2026-10-01T10:00:00Z', read });

function setup(overrides: Record<string, unknown> = {}) {
  const defaults = {
    listContacts: vi.fn((_opts: { page: number; limit: number; unreadOnly?: boolean; q?: string }) => of({ data: [msg('a'), msg('b', true)], total: 2, page: 1, totalPages: 1 })),
    markContactRead: vi.fn(() => of({})),
    replyToContact: vi.fn(() => of({ repliedAt: '2026-10-02T09:00:00Z' })),
    deleteContact: vi.fn(() => of({ success: true })),
    bulkDeleteContacts: vi.fn(() => of({ success: true, deleted: 2 })),
  };
  const api = Object.assign(defaults, overrides) as typeof defaults;
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [provideRouter([]), { provide: AdminDashboardService, useValue: api }],
  });
  const fixture = TestBed.createComponent(ContactsInboxComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, api, el: fixture.nativeElement as HTMLElement };
}

describe('ContactsInboxComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('loads the first page and renders the messages', () => {
    const { api, el } = setup();
    expect(api.listContacts).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: false, q: '' });
    expect(el.querySelectorAll('.ci-item')).toHaveLength(2);
    expect(el.querySelector('.ci-item.unread')?.textContent).toContain('Oggetto a');
  });

  it('debounces the search and resets to page 1', () => {
    vi.useFakeTimers();
    const { c, api, fixture } = setup();
    c.page.set(3);
    c.onSearch('pre');
    c.onSearch('preventivo');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(api.listContacts).toHaveBeenLastCalledWith({ page: 1, limit: 20, unreadOnly: false, q: 'preventivo' });
    expect(api.listContacts.mock.calls.filter(([o]) => o.q === 'pre')).toHaveLength(0);
  });

  it('marks an unread message as read when opened (optimistic, reverted on error)', () => {
    const { c, api } = setup({ markContactRead: vi.fn(() => throwError(() => new Error('x'))) });
    c.open(c.items()[0]);
    expect(api.markContactRead).toHaveBeenCalledWith('a', true);
    expect(c.items()[0].read).toBe(false); // ripristinato dopo l'errore
    expect(c.feedbackKey()).toBe('contacts_inbox.action_error');
  });

  it('sends a reply and records it on the message', () => {
    const { c, api } = setup();
    c.open(c.items()[1]);
    c.replyText.set('  Grazie, ci sentiamo  ');
    c.sendReply();
    expect(api.replyToContact).toHaveBeenCalledWith('b', 'Grazie, ci sentiamo');
    expect(c.selected()?.repliedAt).toBe('2026-10-02T09:00:00Z');
    expect(c.replyText()).toBe('');
  });

  it('bulk-deletes the selection after confirmation and reloads', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { c, api } = setup();
    c.toggleSelectAll();
    c.deleteSelected();
    expect(api.bulkDeleteContacts).toHaveBeenCalledWith(['a', 'b']);
    expect(c.selectedIds().size).toBe(0);
    expect(api.listContacts).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('shows a retryable error state when loading fails', () => {
    const { el } = setup({ listContacts: vi.fn(() => throwError(() => new Error('500'))) });
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('contacts_inbox.load_error');
  });
});
