import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectsService } from './projects.service';
import { Project } from '../models/project.model';

describe('ProjectsService.getBySlug cache', () => {
  let service: ProjectsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProjectsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('serves a prefetched case study from cache, synchronously', () => {
    service.getBySlug('cms').subscribe();
    http.expectOne(r => r.url.endsWith('/projects/slug/cms')).flush({ _id: '1', slug: 'cms' });

    let result: Project | undefined;
    service.getBySlug('cms').subscribe(p => (result = p));
    expect(result?._id).toBe('1');
  });

  it('refetches after the project is updated', () => {
    service.getBySlug('cms').subscribe();
    http.expectOne(r => r.url.endsWith('/projects/slug/cms')).flush({ _id: '1', slug: 'cms' });

    service.update('1', { title: 'Nuovo' }).subscribe();
    http.expectOne(r => r.method === 'PUT').flush({});

    service.getBySlug('cms').subscribe();
    http.expectOne(r => r.url.endsWith('/projects/slug/cms')).flush({ _id: '1', slug: 'cms' });
  });

  it('does not cache a failed request', () => {
    service.getBySlug('x').subscribe({ error: () => {} });
    http.expectOne(r => r.url.endsWith('/projects/slug/x')).flush('no', { status: 500, statusText: 'err' });
    service.getBySlug('x').subscribe({ error: () => {} });
    http.expectOne(r => r.url.endsWith('/projects/slug/x')).flush({ _id: 'x', slug: 'x' });
  });
});
