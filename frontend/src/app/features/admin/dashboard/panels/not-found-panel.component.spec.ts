import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundPanelComponent } from './not-found-panel.component';
import { AdminDashboardService, NotFoundSummary } from '../admin-dashboard.service';

const DATA: NotFoundSummary = {
  open: 1,
  top: [{ _id: 'n1', path: '/en/blog/vecchio-slug', kind: 'blog', count: 14, firstSeenAt: '2026-10-01T10:00:00Z', lastSeenAt: '2026-10-17T09:00:00Z', lastReferrer: 'https://www.google.com/search' }],
};

describe('NotFoundPanelComponent', () => {
  function setup(dismiss = vi.fn(() => of({ success: true })), data = DATA) {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: { dismissNotFound: dismiss } }],
    });
    const fixture = TestBed.createComponent(NotFoundPanelComponent);
    fixture.componentInstance.data = data;
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, dismiss, changed };
  }

  it('shows path, kind, hits and where visitors came from', () => {
    const { el } = setup();
    expect(el.textContent).toContain('/en/blog/vecchio-slug');
    expect(el.textContent).toContain('not_found.kind_blog');
    expect(el.textContent).toContain('×14');
    expect(el.textContent).toContain('https://www.google.com/search');
  });

  it('dismissing asks the dashboard to reload; a failure shows an error', () => {
    const ok = setup();
    (ok.el.querySelector('button') as HTMLButtonElement).click();
    expect(ok.dismiss).toHaveBeenCalledWith('n1');
    expect(ok.changed).toHaveBeenCalled();
  });

  it('keeps the list and shows an error when dismissing fails', () => {
    const { el, fixture, changed } = setup(vi.fn(() => throwError(() => new Error('500'))));
    (el.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(changed).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('says so when there are no broken links', () => {
    const { el } = setup(undefined, { open: 0, top: [] });
    expect(el.textContent).toContain('not_found.none');
  });
});
