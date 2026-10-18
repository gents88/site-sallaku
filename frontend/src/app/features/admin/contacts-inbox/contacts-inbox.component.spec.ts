import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactsInboxComponent, followUpFromDateInput, followUpToDateInput } from './contacts-inbox.component';
import { AdminDashboardService, RecentContact } from '../dashboard/admin-dashboard.service';

const msg = (id: string, read = false): RecentContact => ({ _id: id, name: 'Mario', email: 'm@x.it', subject: `Oggetto ${id}`, message: 'Ciao', createdAt: '2026-10-01T10:00:00Z', read });

function setup(overrides: Record<string, unknown> = {}, query: Record<string, string> = {}) {
  const defaults = {
    listContacts: vi.fn((_opts: { page: number; limit: number; unreadOnly?: boolean; q?: string; status?: string | null; followUpsDue?: boolean }) => of({ data: [msg('a'), msg('b', true)], total: 2, page: 1, totalPages: 1 })),
    markContactRead: vi.fn(() => of({})),
    replyToContact: vi.fn(() => of({ repliedAt: '2026-10-02T09:00:00Z' })),
    deleteContact: vi.fn(() => of({ success: true })),
    bulkDeleteContacts: vi.fn(() => of({ success: true, deleted: 2 })),
    updateLead: vi.fn(() => of({})),
  };
  const api = Object.assign(defaults, overrides) as typeof defaults;
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AdminDashboardService, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  const fixture = TestBed.createComponent(ContactsInboxComponent);
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, api, el: fixture.nativeElement as HTMLElement };
}

describe('ContactsInboxComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('loads the first page and renders the messages', () => {
    const { api, el } = setup();
    expect(api.listContacts).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: false, q: '', status: null, followUpsDue: false });
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
    expect(api.listContacts).toHaveBeenLastCalledWith({ page: 1, limit: 20, unreadOnly: false, q: 'preventivo', status: null, followUpsDue: false });
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

  it('reads ?status, ?followups and ?q from the link it was opened with', () => {
    const { api, c } = setup({}, { status: 'won', followups: '1', q: 'Luca' });
    expect(api.listContacts).toHaveBeenCalledWith({ page: 1, limit: 20, unreadOnly: false, q: 'Luca', status: 'won', followUpsDue: true });
    expect(c.search()).toBe('Luca');
  });

  it('filters by lead status from the toolbar, back to page 1', () => {
    const { api, c, fixture } = setup();
    c.setStatus('in_progress');
    fixture.detectChanges();
    expect(api.listContacts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'in_progress' }));
    c.setStatus('');
    fixture.detectChanges();
    expect(api.listContacts).toHaveBeenLastCalledWith(expect.objectContaining({ status: null }));
  });

  it('shows the effective status of old messages and saves the lead box', () => {
    const { api, c, el } = setup();
    expect(el.querySelector('.ci-lead--new')).not.toBeNull();
    c.open(msg('a'));
    c.leadStatus.set('won');
    c.leadFollowUp.set('2026-10-20');
    c.leadNote.set('  budget ok  ');
    c.saveLead();
    expect(api.updateLead).toHaveBeenCalledWith('a', { status: 'won', followUpAt: followUpFromDateInput('2026-10-20'), internalNote: 'budget ok' });
    expect(c.items().find(i => i._id === 'a')?.status).toBe('won');
  });

  it('follow-up date helpers round-trip a local day', () => {
    expect(followUpToDateInput(followUpFromDateInput('2026-10-20'))).toBe('2026-10-20');
    expect(followUpFromDateInput('')).toBeNull();
  });
});
