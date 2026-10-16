import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { API_URL, SERVER_API_BASE_URL, serverApiBaseInterceptor } from './server-api-base.interceptor';

const SERVER_BASE = 'https://gentsallaku.it/api/v1';

describe('serverApiBaseInterceptor', () => {
  function setup(opts: { apiUrl: string; serverBase?: string }) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([serverApiBaseInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: opts.apiUrl },
        ...(opts.serverBase ? [{ provide: SERVER_API_BASE_URL, useValue: opts.serverBase }] : []),
      ],
    });
    return { http: TestBed.inject(HttpClient), httpMock: TestBed.inject(HttpTestingController) };
  }

  it('makes relative API URLs absolute while prerendering, keeping path and query', () => {
    const { http, httpMock } = setup({ apiUrl: '/api/v1', serverBase: SERVER_BASE });

    http.get('/api/v1/blog/posts?page=1&limit=10').subscribe();

    httpMock.expectOne(`${SERVER_BASE}/blog/posts?page=1&limit=10`).flush({});
    httpMock.verify();
  });

  it('leaves URLs untouched in the browser, where the server base is not provided', () => {
    const { http, httpMock } = setup({ apiUrl: '/api/v1' });

    http.get('/api/v1/about').subscribe();

    httpMock.expectOne('/api/v1/about').flush({});
    httpMock.verify();
  });

  it('ignores requests outside the API (e.g. i18n files) and absolute API bases', () => {
    const relative = setup({ apiUrl: '/api/v1', serverBase: SERVER_BASE });
    relative.http.get('/i18n/en.json').subscribe();
    relative.httpMock.expectOne('/i18n/en.json').flush({});
    relative.httpMock.verify();

    TestBed.resetTestingModule();

    const absolute = setup({ apiUrl: 'https://api.example.com/api/v1', serverBase: SERVER_BASE });
    absolute.http.get('https://api.example.com/api/v1/projects').subscribe();
    absolute.httpMock.expectOne('https://api.example.com/api/v1/projects').flush([]);
    absolute.httpMock.verify();
  });
});
