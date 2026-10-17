import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BlogManageComponent } from './blog-manage.component';
import { BlogService } from '../../../core/services/blog.service';
import { PrismService } from '../../../shared/services/prism.service';
import { Post } from '../../../core/models/post.model';

const post = (id: string, published: boolean) => ({ _id: id, title: `Post ${id}`, slug: id, tags: [], published }) as unknown as Post;

async function setup(query: Record<string, string>) {
  const params = new BehaviorSubject(convertToParamMap(query));
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      { provide: BlogService, useValue: { getAll: vi.fn(() => of([post('a', true), post('b', false), post('c', false)])) } },
      { provide: PrismService, useValue: { highlightAllUnder: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
    ],
  });
  const fixture = TestBed.createComponent(BlogManageComponent);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, params, navigate, el: fixture.nativeElement as HTMLElement };
}

describe('BlogManageComponent — ?edit=<id>', () => {
  it('apre il post indicato (link "traduzioni da sistemare" della dashboard) e toglie il parametro', async () => {
    const { c, navigate } = await setup({ edit: 'b' });
    expect(c.showForm).toBe(true);
    expect(c.editingId).toBe('b');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { edit: null }, replaceUrl: true }));
  });

  it('un id che non esiste non apre nulla', async () => {
    const { c, navigate } = await setup({ edit: 'zzz' });
    expect(c.showForm).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
