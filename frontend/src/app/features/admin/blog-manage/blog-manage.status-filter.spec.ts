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

async function setup(status: string | null) {
  const params = new BehaviorSubject(convertToParamMap(status ? { status } : {}));
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

describe('BlogManageComponent — filtro per stato', () => {
  it('?status=draft (card "Bozze" della dashboard) mostra solo le bozze', async () => {
    const { c, el } = await setup('draft');
    expect(c.statusFilter).toBe('draft');
    expect(c.visiblePosts.map(p => p._id)).toEqual(['b', 'c']);
    expect(el.querySelectorAll('.list .list-item')).toHaveLength(2);
  });

  it('senza parametro mostra tutto, con i conteggi', async () => {
    const { c } = await setup(null);
    expect(c.visiblePosts).toHaveLength(3);
    expect(c.draftCount).toBe(2);
  });

  it("il filtro scelto aggiorna l'URL e la lista segue il parametro", async () => {
    const { c, params, navigate, fixture } = await setup(null);
    c.setStatusFilter('published');
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { status: 'published' } }));
    params.next(convertToParamMap({ status: 'published' }));
    fixture.detectChanges();
    expect(c.visiblePosts.map(p => p._id)).toEqual(['a']);
    c.setStatusFilter('all');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { status: null } }));
  });

  it('un valore sconosciuto torna a "tutti"', async () => {
    const { c } = await setup('cestino');
    expect(c.statusFilter).toBe('all');
  });
});
