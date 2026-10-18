import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, FeatureFlagsService, normalizeFlags } from './feature-flags.service';
import { environment } from '../../../environments/environment';

const URL = `${environment.apiUrl}/system/flags`;

describe('normalizeFlags', () => {
  it('fills missing or malformed fields with the defaults', () => {
    expect(normalizeFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
    const flags = normalizeFlags({ aiEnabled: false, chatbotEnabled: 'no' as never });
    expect(flags.aiEnabled).toBe(false);
    expect(flags.chatbotEnabled).toBe(true);
    expect(flags.maintenanceMessage).toBe('');
  });
});

describe('FeatureFlagsService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(FeatureFlagsService);
    const http = TestBed.inject(HttpTestingController);
    return { service, http };
  }

  it('starts with everything on and applies the server flags once they arrive', () => {
    const { service, http } = setup();
    expect(service.chatbotEnabled()).toBe(true);
    expect(service.loaded()).toBe(false);

    http.expectOne(URL).flush({ chatbotEnabled: false, maintenanceMode: true });

    expect(service.chatbotEnabled()).toBe(false);
    expect(service.maintenanceMode()).toBe(true);
    expect(service.loaded()).toBe(true);
  });

  it('keeps the current flags when the request fails (a slow backend switches nothing off)', () => {
    const { service, http } = setup();
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(service.flags()).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('update() sends only the patch and adopts the server response', () => {
    const { service, http } = setup();
    http.expectOne(URL).flush({});

    let result: unknown;
    service.update({ aiEnabled: false }).subscribe((r) => (result = r));
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ aiEnabled: false });
    req.flush({ ...DEFAULT_FEATURE_FLAGS, aiEnabled: false });

    expect(service.aiEnabled()).toBe(false);
    expect(result).toEqual(expect.objectContaining({ aiEnabled: false }));
  });
});
