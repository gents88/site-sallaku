import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { importProvidersFrom, signal } from '@angular/core';
import { Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BlogListComponent } from './blog-list.component';
import { BlogService } from '../../../core/services/blog.service';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';
import { PostSummary } from '../../../core/models/post.model';
import { provideFeatureFlagsStub } from '../../../core/services/feature-flags.testing';

const summary = (title: string) => ({ _id: title, title, slug: title, excerpt: '', tags: [], publishedAt: null } as unknown as PostSummary);

describe('BlogListComponent — lista nella lingua della pagina', () => {
  const lang = signal('en');
  let getPublishedAll: ReturnType<typeof vi.fn>;

  function create() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        importProvidersFrom(TranslateModule.forRoot()),
        provideFeatureFlagsStub(),
        { provide: BlogService, useValue: { getPublishedAll } },
        { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
        { provide: LanguageService, useValue: { current: lang } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    });
    const fixture = TestBed.createComponent(BlogListComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    lang.set('en');
    getPublishedAll = vi.fn(() => of([summary('a')]));
  });

  it('chiede la lista nella lingua corrente', () => {
    create();
    expect(getPublishedAll).toHaveBeenCalledWith(undefined, 'en');
  });

  it('al cambio lingua riscarica la lista nella nuova lingua', () => {
    const fixture = create();
    expect(getPublishedAll).toHaveBeenCalledTimes(1);

    lang.set('de');
    fixture.detectChanges();

    expect(getPublishedAll).toHaveBeenCalledTimes(2);
    expect(getPublishedAll).toHaveBeenLastCalledWith(undefined, 'de');
  });

  it('non riscarica se la lingua non cambia', () => {
    const fixture = create();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(getPublishedAll).toHaveBeenCalledTimes(1);
  });

  it('ignora una risposta arrivata in ritardo per una lingua che non è più quella corrente', () => {
    const slow = new Subject<PostSummary[]>();
    getPublishedAll = vi.fn((_tag?: string, l?: string) => (l === 'en' ? slow : of([summary('tedesco')])));
    const fixture = create();

    lang.set('de');
    fixture.detectChanges();
    expect(fixture.componentInstance.posts.map(p => p.title)).toEqual(['tedesco']);

    slow.next([summary('english')]);
    slow.complete();
    expect(fixture.componentInstance.posts.map(p => p.title)).toEqual(['tedesco']);
  });
});
