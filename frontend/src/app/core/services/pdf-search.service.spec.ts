import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { PdfSearchService, PdfSearchResult } from './pdf-search.service';
import { environment } from '@env/environment';

function makeResult(overrides: Partial<PdfSearchResult> = {}): PdfSearchResult {
  return {
    id: 'r-1', title: 'Title', author: '', year: '', source: 'internet_archive', sourceLabel: 'Internet Archive',
    pdfUrl: 'https://archive.org/download/x/x.pdf', coverUrl: null, detailsUrl: 'https://archive.org/details/x',
    previewable: true, scanPpi: null,
    ...overrides,
  };
}

describe('PdfSearchService', () => {
  let service: PdfSearchService;
  let httpMock: HttpTestingController;

  const apiUrl = `${environment.apiUrl}/pdf-search`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PdfSearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('search() calls the pdf-search endpoint with the query param', async () => {
    const promise = firstValueFrom(service.search('piccolo principe'));

    const req = httpMock.expectOne((r) => r.url === apiUrl && r.params.get('q') === 'piccolo principe');
    expect(req.request.method).toBe('GET');
    req.flush({ results: [makeResult()] });

    const results = await promise;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('r-1');
  });

  it('search() toggles isLoading while the request is in flight', async () => {
    expect(service.isLoading()).toBe(false);

    const promise = firstValueFrom(service.search('query'));
    expect(service.isLoading()).toBe(true);

    httpMock.expectOne((r) => r.url === apiUrl).flush({ results: [] });
    await promise;

    expect(service.isLoading()).toBe(false);
  });

  it('downloadBlob() fetches a Gutenberg result directly (already on our own backend, CORS-open)', async () => {
    const gutenbergResult = makeResult({ source: 'gutenberg', pdfUrl: `${environment.apiUrl}/pdf-search/gutenberg/42` });

    const promise = firstValueFrom(service.downloadBlob(gutenbergResult));

    const req = httpMock.expectOne(`${environment.apiUrl}/pdf-search/gutenberg/42`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['pdf-bytes']));

    await expect(promise).resolves.toBeInstanceOf(Blob);
  });

  it('downloadBlob() routes non-Gutenberg sources through the /proxy relay (source has no CORS headers on its own)', async () => {
    const iaResult = makeResult({ source: 'internet_archive', pdfUrl: 'https://archive.org/download/x/x.pdf' });

    const promise = firstValueFrom(service.downloadBlob(iaResult));

    const req = httpMock.expectOne(`${apiUrl}/proxy?url=${encodeURIComponent(iaResult.pdfUrl)}`);
    req.flush(new Blob(['pdf-bytes']));

    await expect(promise).resolves.toBeInstanceOf(Blob);
  });
});
