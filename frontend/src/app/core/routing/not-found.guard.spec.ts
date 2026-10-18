import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { notFoundGuard } from './not-found.guard';
import { NotFoundReporterService } from '../services/not-found-reporter.service';
import { environment } from '../../../environments/environment';

const URL = `${environment.apiUrl}/analytics/not-found`;

describe('notFoundGuard / NotFoundReporterService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
  }

  it('reports the missing path without the query string and sends the visitor home', () => {
    const { http, router } = setup();
    const result = TestBed.runInInjectionContext(() =>
      notFoundGuard({} as never, { url: '/en/vecchia-pagina?utm_source=x' } as RouterStateSnapshot),
    );
    expect(result instanceof UrlTree && router.serializeUrl(result)).toBe('/');
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual(expect.objectContaining({ path: '/en/vecchia-pagina', kind: 'route' }));
    req.flush({ success: true });
  });

  it('reports each path once per page load and never the admin area', () => {
    const { http } = setup();
    const reporter = TestBed.inject(NotFoundReporterService);
    reporter.report('/blog/x', 'blog');
    reporter.report('/blog/x?y=1', 'blog');
    reporter.report('/dashboard/qualcosa', 'route');
    http.expectOne(URL).flush({});
  });

  it('ignores network errors', () => {
    const { http } = setup();
    TestBed.inject(NotFoundReporterService).report('/x', 'route');
    expect(() => http.expectOne(URL).flush('boom', { status: 500, statusText: 'err' })).not.toThrow();
  });
});
