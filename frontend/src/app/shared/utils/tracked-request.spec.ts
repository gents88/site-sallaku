import { DestroyRef } from '@angular/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TrackedRequest } from './tracked-request';
import { UploadEvent } from '../../core/http/upload-events';

function fakeDestroyRef() {
  const callbacks: Array<() => void> = [];
  return {
    ref: { onDestroy: (cb: () => void) => { callbacks.push(cb); return () => {}; } } as unknown as DestroyRef,
    destroy: () => callbacks.forEach(cb => cb()),
  };
}

describe('TrackedRequest', () => {
  it('exposes upload %, then processing, then delivers the body and resets', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    const next = vi.fn();

    req.run(events, { next, error: vi.fn() });
    expect(req.active()).toBe(true);

    events.next({ type: 'progress', percent: 40 });
    expect(req.uploadPercent()).toBe(40);
    expect(req.uploading()).toBe(true);

    events.next({ type: 'processing' });
    expect(req.processing()).toBe(true);
    expect(req.uploading()).toBe(false);

    events.next({ type: 'done', body: 'ok' });
    expect(next).toHaveBeenCalledWith('ok');
    expect(req.active()).toBe(false);
    expect(req.uploadPercent()).toBeNull();
  });

  it('cancel() unsubscribes (aborting the HTTP call), resets state and notifies', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    const cancelled = vi.fn();
    const next = vi.fn();

    req.run(events, { next, error: vi.fn(), cancelled });
    expect(req.cancel()).toBe(true);
    expect(events.observed).toBe(false);
    expect(req.active()).toBe(false);
    expect(cancelled).toHaveBeenCalledTimes(1);

    events.next({ type: 'done', body: 'late' });
    expect(next).not.toHaveBeenCalled();
    expect(req.cancel()).toBe(false);
  });

  it('is cancelled automatically when the owning component is destroyed (leaving the page)', () => {
    const { ref, destroy } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    req.run(events, { next: vi.fn(), error: vi.fn() });

    destroy();
    expect(events.observed).toBe(false);
  });

  it('forwards errors and resets', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    const error = vi.fn();
    req.run(events, { next: vi.fn(), error });
    events.error({ status: 429 });
    expect(error).toHaveBeenCalledWith({ status: 429 });
    expect(req.active()).toBe(false);
  });

  it('starting a new run cancels the previous one', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const first = new Subject<UploadEvent<string>>();
    req.run(first, { next: vi.fn(), error: vi.fn() });
    req.run(new Subject<UploadEvent<string>>(), { next: vi.fn(), error: vi.fn() });
    expect(first.observed).toBe(false);
  });
});
