import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { BlogService } from './blog.service';

describe('BlogService.getPublished — parametro lang', () => {
  let service: BlogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BlogService);
    http = TestBed.inject(HttpTestingController);
  });

  const emptyPage = { data: [], total: 0, page: 1, totalPages: 0 };

  it('invia lang al backend quando è indicata', () => {
    service.getPublishedAll(undefined, 'sq').subscribe();
    const req = http.expectOne(r => r.url.endsWith('/blog/posts'));
    expect(req.request.params.get('lang')).toBe('sq');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush(emptyPage);
  });

  it('senza lang non aggiunge il parametro (risposta completa come prima)', () => {
    service.getPublishedAll().subscribe();
    const req = http.expectOne(r => r.url.endsWith('/blog/posts'));
    expect(req.request.params.has('lang')).toBe(false);
    req.flush(emptyPage);
  });

  it('non riusa la cache di un\'altra lingua', () => {
    service.getPublishedAll(undefined, 'fr').subscribe();
    http.expectOne(r => r.url.endsWith('/blog/posts')).flush(emptyPage);

    service.getPublishedAll(undefined, 'es').subscribe();
    const second = http.expectOne(r => r.url.endsWith('/blog/posts'));
    expect(second.request.params.get('lang')).toBe('es');
    second.flush(emptyPage);
  });

  it('se il backend è più vecchio e rifiuta lang con 400, ripiega sulla lista completa', () => {
    let result: unknown;
    service.getPublishedAll(undefined, 'pt').subscribe(r => (result = r));

    http.expectOne(r => r.url.endsWith('/blog/posts') && r.params.has('lang'))
      .flush({ message: ['property lang should not exist'] }, { status: 400, statusText: 'Bad Request' });
    const retry = http.expectOne(r => r.url.endsWith('/blog/posts') && !r.params.has('lang'));
    retry.flush({ data: [{ _id: '1' }], total: 1, page: 1, totalPages: 1 });

    expect(result).toEqual([{ _id: '1' }]);
  });

  it('un errore diverso da 400 non viene mascherato', () => {
    let failed = false;
    service.getPublishedAll(undefined, 'de').subscribe({ error: () => (failed = true) });
    http.expectOne(r => r.url.endsWith('/blog/posts')).flush('boom', { status: 500, statusText: 'Server Error' });
    http.expectNone(r => r.url.endsWith('/blog/posts'));
    expect(failed).toBe(true);
  });
});
