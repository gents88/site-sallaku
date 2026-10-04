import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unsavedChangesGuard, warnOnUnload } from './unsaved-changes.guard';
import { DirtyTracker } from '../../shared/utils/dirty-tracker';

const run = (dirty: boolean) =>
  TestBed.runInInjectionContext(() => unsavedChangesGuard({ hasUnsavedChanges: () => dirty }, null as never, null as never, null as never));

describe('unsavedChangesGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lets you leave a clean page without asking', () => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const confirmSpy = vi.spyOn(window, 'confirm');
    expect(run(false)).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved changes and respects the answer', () => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(run(true)).toBe(false);
    expect(run(true)).toBe(true);
  });
});

describe('warnOnUnload', () => {
  it('blocks unload only when dirty', () => {
    const clean = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
    warnOnUnload(clean, false);
    expect(clean.preventDefault).not.toHaveBeenCalled();
    const dirty = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
    warnOnUnload(dirty, true);
    expect(dirty.preventDefault).toHaveBeenCalled();
  });
});

describe('DirtyTracker', () => {
  it('is clean until marked, then dirty only when the value differs from the snapshot', () => {
    const t = new DirtyTracker();
    expect(t.isDirty({ a: 1 })).toBe(false);
    t.mark({ a: 1, tags: ['x'] });
    expect(t.isDirty({ a: 1, tags: ['x'] })).toBe(false);
    expect(t.isDirty({ a: 1, tags: ['x', 'y'] })).toBe(true);
    t.reset();
    expect(t.isDirty({ a: 2 })).toBe(false);
  });
});
