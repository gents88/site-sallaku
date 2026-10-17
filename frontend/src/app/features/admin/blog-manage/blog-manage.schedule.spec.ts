import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BlogManageComponent, fromLocalDateTimeInput, toLocalDateTimeInput } from './blog-manage.component';
import { BlogService } from '../../../core/services/blog.service';
import { PrismService } from '../../../shared/services/prism.service';
import { Post } from '../../../core/models/post.model';

const post = (overrides: Partial<Post> = {}) =>
  ({ _id: 'p1', title: 'Titolo del post', slug: 'titolo', content: 'Contenuto abbastanza lungo', tags: [], published: true, ...overrides }) as unknown as Post;

async function setup() {
  const params = new BehaviorSubject(convertToParamMap({}));
  const blog = {
    getAll: vi.fn(() => of([post()])),
    update: vi.fn((_id: string, payload: unknown) => of({ _id: 'p1', ...(payload as object) })),
    create: vi.fn(() => of(post())),
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideNoopAnimations(),
      { provide: BlogService, useValue: blog },
      { provide: PrismService, useValue: { highlightAllUnder: vi.fn() } },
      { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
    ],
  });
  const fixture = TestBed.createComponent(BlogManageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, c: fixture.componentInstance, blog };
}

describe('datetime-local helpers', () => {
  it('round-trips a local date-time through ISO', () => {
    const iso = fromLocalDateTimeInput('2026-10-20T09:30');
    expect(iso).not.toBeNull();
    expect(toLocalDateTimeInput(iso)).toBe('2026-10-20T09:30');
  });

  it('treats empty or invalid values as "no schedule"', () => {
    expect(fromLocalDateTimeInput('')).toBeNull();
    expect(fromLocalDateTimeInput('boh')).toBeNull();
    expect(toLocalDateTimeInput(null)).toBe('');
  });
});

describe('BlogManageComponent — programmazione', () => {
  it('rifiuta una data nel passato senza salvare', async () => {
    const { c, blog } = await setup();
    // MatSnackBarModule è importato dal componente standalone: si spia l'istanza che usa davvero.
    const open = vi.spyOn((c as unknown as { snackBar: MatSnackBar }).snackBar, 'open').mockReturnValue(undefined as never);
    c.openCreate();
    c.form.patchValue({ title: 'Nuovo articolo', content: 'Contenuto abbastanza lungo', scheduledAt: '2020-01-01T10:00' });
    c.schedule();
    expect(blog.create).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('blog_manage.schedule_past', expect.anything(), expect.anything());
  });

  it('programma una bozza con la data in ISO', async () => {
    const { c, blog } = await setup();
    c.openCreate();
    const future = toLocalDateTimeInput(new Date(Date.now() + 86_400_000).toISOString());
    c.form.patchValue({ title: 'Nuovo articolo', content: 'Contenuto abbastanza lungo', scheduledAt: future, notifySubscribers: true });
    c.schedule();
    const payload = (blog.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload['published']).toBe(false);
    expect(payload['scheduledAt']).toBe(fromLocalDateTimeInput(future));
    expect(payload['notifySubscribers']).toBe(true);
  });

  it("l'autosave di un post esistente non manda published (non lo rimette in bozza)", async () => {
    const { c, blog } = await setup();
    c.openEdit(post());
    (c as unknown as { performAutoSave(): void }).performAutoSave();
    const payload = (blog.update.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('published');
    expect(payload['title']).toBe('Titolo del post');
  });

  it('segna come programmati solo le bozze con una data', () => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const isScheduled = BlogManageComponent.prototype.isScheduled;
    expect(isScheduled(post({ published: false, scheduledAt: '2026-10-20T08:00:00Z' }))).toBe(true);
    expect(isScheduled(post({ published: true, scheduledAt: '2026-10-20T08:00:00Z' }))).toBe(false);
    expect(isScheduled(post({ published: false, scheduledAt: null }))).toBe(false);
  });
});
