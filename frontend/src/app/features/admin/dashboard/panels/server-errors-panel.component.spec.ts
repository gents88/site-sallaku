import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ServerErrorsPanelComponent } from './server-errors-panel.component';
import { AdminDashboardService, ServerErrorSummary } from '../admin-dashboard.service';

const DATA: ServerErrorSummary = {
  open: 1,
  today: 3,
  week: 7,
  recent: [{
    _id: 'e1', method: 'GET', route: '/api/v1/search', path: '/api/v1/search', status: 500, name: 'MongoServerError',
    message: 'text index required', stack: 'MongoServerError: text index required\n    at x', count: 12, today: 3,
    firstSeenAt: '2026-10-04T10:00:00Z', lastSeenAt: '2026-10-17T09:00:00Z', resolvedAt: null,
  }],
};

describe('ServerErrorsPanelComponent', () => {
  function setup(data: ServerErrorSummary = DATA, api: Partial<Record<'resolveServerError' | 'resolveAllServerErrors', ReturnType<typeof vi.fn>>> = {}) {
    const service = {
      resolveServerError: api.resolveServerError ?? vi.fn(() => of({ success: true })),
      resolveAllServerErrors: api.resolveAllServerErrors ?? vi.fn(() => of({ resolved: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: service }],
    });
    const fixture = TestBed.createComponent(ServerErrorsPanelComponent);
    fixture.componentInstance.data = data;
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) => Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes(label)) as HTMLButtonElement;
    return { fixture, el, service, changed, button };
  }

  it('lists open groups with route, status, count and message; the stack is collapsed', () => {
    const { el } = setup();
    expect(el.textContent).toContain('GET /api/v1/search');
    expect(el.textContent).toContain('×12');
    expect(el.textContent).toContain('text index required');
    expect(el.querySelector('pre')).toBeNull();
  });

  it('expands the stack on demand', () => {
    const { fixture, el, button } = setup();
    button('server_errors.show_stack').click();
    fixture.detectChanges();
    expect(el.querySelector('pre')?.textContent).toContain('at x');
  });

  it('resolving asks the dashboard to reload', () => {
    const { service, changed, button } = setup();
    button('server_errors.resolve').click();
    expect(service.resolveServerError).toHaveBeenCalledWith('e1');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('shows an error and does not reload if resolving fails', () => {
    const { fixture, el, changed, button } = setup(DATA, { resolveAllServerErrors: vi.fn(() => throwError(() => new Error('500'))) });
    button('server_errors.resolve_all').click();
    fixture.detectChanges();
    expect(changed).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('says so when there is nothing open', () => {
    const { el } = setup({ open: 0, today: 0, week: 0, recent: [] });
    expect(el.textContent).toContain('server_errors.none');
  });
});
