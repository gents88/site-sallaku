import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewsletterCampaignsComponent } from './newsletter-campaigns.component';
import { NewsletterAdminService, NewsletterCampaign } from '../../../../core/services/newsletter-admin.service';
import { AuthService } from '../../../../core/services/auth.service';

const draft: NewsletterCampaign = {
  _id: 'c1', subject: 'Novità di ottobre', html: '<p>Ciao a tutti</p>', status: 'draft',
  scheduledAt: null, sentAt: null, testSentAt: null, stats: { total: 0, sent: 0, failed: 0 }, createdAt: '2026-10-01',
};

function setup(overrides: Record<string, unknown> = {}) {
  const defaults = {
    listCampaigns: vi.fn(() => of([draft])),
    createCampaign: vi.fn(() => of({ ...draft, _id: 'new' })),
    updateCampaign: vi.fn(() => of(draft)),
    deleteCampaign: vi.fn(() => of(undefined)),
    testCampaign: vi.fn(() => of({ success: true })),
    sendCampaign: vi.fn((_id: string, _at?: string) => of({ ...draft, status: 'scheduled', stats: { total: 12, sent: 0, failed: 0 } })),
    cancelCampaign: vi.fn(() => of(draft)),
  };
  const api = Object.assign(defaults, overrides) as typeof defaults;
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      { provide: NewsletterAdminService, useValue: api },
      { provide: AuthService, useValue: { currentUser: signal({ email: 'gent@x.it' }) } },
    ],
  });
  const fixture = TestBed.createComponent(NewsletterCampaignsComponent);
  fixture.detectChanges();
  return { c: fixture.componentInstance, api, el: fixture.nativeElement as HTMLElement };
}

describe('NewsletterCampaignsComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists campaigns and prefills the test address with the admin email', () => {
    const { c, el } = setup();
    expect(el.textContent).toContain('Novità di ottobre');
    expect(c.testEmail()).toBe('gent@x.it');
  });

  it('validates the draft before saving', () => {
    const { c, api } = setup();
    c.newDraft();
    c.subject.set('Hi');
    c.saveDraft();
    expect(api.createCampaign).not.toHaveBeenCalled();
    expect(c.message()?.error).toBe(true);
    c.subject.set('Ottobre');
    c.html.set('<p>Contenuto abbastanza lungo</p>');
    c.saveDraft();
    expect(api.createCampaign).toHaveBeenCalledWith({ subject: 'Ottobre', html: '<p>Contenuto abbastanza lungo</p>' });
  });

  it('sends only after confirmation and reports how many recipients were queued', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { c, api } = setup();
    c.send(draft, false);
    expect(api.sendCampaign).not.toHaveBeenCalled();
    c.send(draft, false);
    expect(api.sendCampaign).toHaveBeenCalledWith('c1', undefined);
    expect(c.message()).toEqual({ key: 'newsletter_campaigns.queued', params: { count: 12 } });
  });

  it('refuses to schedule in the past', () => {
    const { c, api } = setup();
    c.scheduleAt.set('2000-01-01T10:00');
    c.send(draft, true);
    expect(api.sendCampaign).not.toHaveBeenCalled();
    expect(c.message()?.key).toBe('newsletter_campaigns.err_schedule_past');
  });

  it('shows the server reason when an action fails', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { c } = setup({ sendCampaign: vi.fn(() => throwError(() => ({ error: { message: 'No confirmed subscribers' } }))) });
    c.send(draft, false);
    expect(c.message()).toEqual({ key: 'No confirmed subscribers', error: true });
  });

  it('computes delivery progress', () => {
    const { c } = setup();
    expect(c.progress({ ...draft, stats: { total: 10, sent: 6, failed: 1 } })).toBe(70);
  });
});
