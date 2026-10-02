import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { importProvidersFrom, PLATFORM_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BlogDetailComponent } from './blog-detail.component';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { Post } from '../../../core/models/post.model';

const post = { _id: '1', slug: 'blinisht', title: 'Blinisht', title_sq: 'Blinishti', excerpt: '', tags: [] } as unknown as Post;

describe('BlogDetailComponent view tracking', () => {
  function create(platform: 'browser' | 'server') {
    const blogService = { getBySlug: vi.fn(() => of(post)), trackView: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({
      providers: [
        importProvidersFrom(TranslateModule.forRoot()),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: BlogService, useValue: blogService },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: () => 'sq' } },
      ],
    });
    const component = TestBed.createComponent(BlogDetailComponent).componentInstance;
    component.slug = 'blinisht';
    component.ngOnInit();
    return { component, blogService };
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
});
