import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { PRERENDER_BLOG_POSTS, prerenderBlogCacheInterceptor } from './prerender-blog-cache.interceptor';
import { Post } from '../models/post.model';

const API = 'https://api.example.com/api/v1';
const cached = { _id: '1', slug: 'blinisht-storia', title: 'Blinisht' } as unknown as Post;

describe('prerenderBlogCacheInterceptor', () => {
  function setup(posts: Post[] | null) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([prerenderBlogCacheInterceptor])),
        provideHttpClientTesting(),
        ...(posts ? [{ provide: PRERENDER_BLOG_POSTS, useValue: new Map(posts.map(p => [p.slug, p])) }] : []),
      ],
    });
    return { http: TestBed.inject(HttpClient), httpMock: TestBed.inject(HttpTestingController) };
  }

  it('serves a cached post without hitting the network', () => {
    const { http, httpMock } = setup([cached]);
    let body: unknown;

    http.get(`${API}/blog/posts/blinisht-storia`).subscribe(res => (body = res));

    expect(body).toEqual(cached);
    httpMock.verify();
  });

  it('falls through to the network for slugs not in the cache', () => {
    const { http, httpMock } = setup([cached]);

    http.get(`${API}/blog/posts/other-post`).subscribe();

    httpMock.expectOne(`${API}/blog/posts/other-post`).flush({});
    httpMock.verify();
  });

  it('never intercepts the list, the view tracker or admin routes', () => {
    const { http, httpMock } = setup([cached]);

    http.get(`${API}/blog/posts?page=1`).subscribe();
    http.post(`${API}/blog/posts/blinisht-storia/view`, {}).subscribe();
    http.get(`${API}/blog/admin/posts/blinisht-storia`).subscribe();

    httpMock.expectOne(`${API}/blog/posts?page=1`).flush({});
    httpMock.expectOne(`${API}/blog/posts/blinisht-storia/view`).flush(null);
    httpMock.expectOne(`${API}/blog/admin/posts/blinisht-storia`).flush({});
    httpMock.verify();
  });

  it('is a no-op in the browser, where no cache is provided', () => {
    const { http, httpMock } = setup(null);

    http.get(`${API}/blog/posts/blinisht-storia`).subscribe();

    httpMock.expectOne(`${API}/blog/posts/blinisht-storia`).flush({});
    httpMock.verify();
  });
});
