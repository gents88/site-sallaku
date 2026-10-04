import { TestBed } from '@angular/core/testing';
import { HttpBackend, HttpXhrBackend, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { UploadClient } from './upload-client.service';
import { AuthService } from '../services/auth.service';

function setup(token: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // In produzione è il backend XHR reale: qui lo sostituisce quello di test.
      { provide: HttpXhrBackend, useExisting: HttpBackend },
      { provide: AuthService, useValue: { getToken: () => token } },
    ],
  });
  return { client: TestBed.inject(UploadClient), http: TestBed.inject(HttpTestingController) };
}

describe('UploadClient', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('asks for upload progress events (the fetch backend never emits them)', () => {
    const { client, http } = setup(null);
    client.post('/api/ai/summarize-file', new FormData()).subscribe();
    const req = http.expectOne('/api/ai/summarize-file');
    expect(req.request.reportProgress).toBe(true);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('adds the bearer token itself, since it bypasses the interceptors', () => {
    const { client, http } = setup('tok');
    client.post('/api/ocr/extract', new FormData()).subscribe();
    const req = http.expectOne('/api/ocr/extract');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush({});
  });

  it('aborts the request when the subscriber unsubscribes', () => {
    const { client, http } = setup(null);
    const sub = client.post('/api/ai/translate-pdf', new FormData()).subscribe();
    const req = http.expectOne('/api/ai/translate-pdf');
    sub.unsubscribe();
    expect(req.cancelled).toBe(true);
  });
});
