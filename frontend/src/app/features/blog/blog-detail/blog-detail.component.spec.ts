import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { importProvidersFrom, PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BlogDetailComponent } from './blog-detail.component';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { Post } from '../../../core/models/post.model';

const post = {
  _id: '1', slug: 'blinisht', slug_sq: 'blinishti', title: 'Blinisht', title_sq: 'Blinishti', excerpt: '', tags: [],
} as unknown as Post;

describe('BlogDetailComponent view tracking', () => {
  function create(platform: 'browser' | 'server', urlSlug = 'blinisht') {
    const location = { replaceState: vi.fn() };
    const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) };
    const blogService = { getBySlug: vi.fn(() => of(post)), trackView: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: BlogService, useValue: blogService },
        { provide: SeoService, useValue: seo },
        { provide: Location, useValue: location },
        { provide: LanguageService, useValue: { current: () => 'sq' } },
      ],
    });
    const component = TestBed.createComponent(BlogDetailComponent).componentInstance;
    component.slug = urlSlug;
    component.ngOnInit();
    return { component, blogService, location, seo };
  }

  it('counts a view in the browser', () => {
    const { component, blogService } = create('browser');
    expect(component.post).toBe(post);
    expect(blogService.trackView).toHaveBeenCalledWith('blinisht');
  });

  it('does not count a view while prerendering on the server', () => {
    const { component, blogService } = create('server');
    expect(component.post).toBe(post);
    expect(blogService.trackView).not.toHaveBeenCalled();
  });

  describe('translated slug', () => {
    it('uses the Albanian slug for canonical/og:url and every hreflang path', () => {
      const { component, seo } = create('browser', 'blinishti');
      expect(component.pageUrl).toBe('https://gentsallaku.it/sq/blog/blinishti');
      const data = seo.update.mock.calls[0][0];
      expect(data.url).toBe('https://gentsallaku.it/sq/blog/blinishti');
      expect(data.alternatePaths.sq).toBe('/blog/blinishti');
      expect(data.alternatePaths.it).toBe('/blog/blinisht');
      expect(data.alternatePaths.en).toBe('/blog/blinisht'); // no slug_en → Italian fallback
    });

    it('corrects an old Italian-slug link to the Albanian URL in the browser', () => {
      const { location } = create('browser', 'blinisht');
      expect(location.replaceState).toHaveBeenCalledWith('/sq/blog/blinishti');
    });

    it('leaves the URL alone when it already carries the right slug', () => {
      const { location } = create('browser', 'blinishti');
      expect(location.replaceState).not.toHaveBeenCalled();
    });

    it('never rewrites the URL while prerendering', () => {
      const { location, seo } = create('server', 'blinisht');
      expect(location.replaceState).not.toHaveBeenCalled();
      expect(seo.update.mock.calls[0][0].url).toBe('https://gentsallaku.it/sq/blog/blinishti');
    });
  });
});

describe('BlogDetailComponent publish from preview', () => {
  function createPreview(published: boolean) {
    const draft = { ...post, published } as Post;
    const blogService = {
      getOne: vi.fn(() => of(draft)),
      update: vi.fn(() => of({ ...draft, published: true, publishedAt: '2026-10-02T00:00:00Z' })),
    };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: BlogService, useValue: blogService },
        { provide: SeoService, useValue: { update: vi.fn() } },
        { provide: LanguageService, useValue: { current: () => 'it' } },
      ],
    });
    const fixture = TestBed.createComponent(BlogDetailComponent);
    fixture.componentInstance.id = '1';
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, blogService };
  }

  it('shows the Publish button for a draft and publishes it', () => {
    const { fixture, component, blogService } = createPreview(false);
    const btn = fixture.nativeElement.querySelector('.post-article__toolbar button');
    expect(btn).toBeTruthy();
    component.publish();
    expect(blogService.update).toHaveBeenCalledWith('1', { published: true });
    expect(component.post?.published).toBe(true);
  });

  it('hides the Publish button when the article is already published', () => {
    const { fixture } = createPreview(true);
    expect(fixture.nativeElement.querySelector('.post-article__toolbar button')).toBeNull();
  });
});
