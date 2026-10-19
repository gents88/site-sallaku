import { DestroyRef } from '@angular/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TrackedRequest, isRetryableError } from './tracked-request';
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

describe('isRetryableError', () => {
  it('riprovare ha senso per rete assente, timeout, 429 e 5xx', () => {
    for (const status of [undefined, 0, 408, 425, 429, 500, 502, 503, 504]) {
      expect(isRetryableError({ status }), String(status)).toBe(true);
    }
  });

  it('non ha senso per errori del client che darebbero lo stesso esito', () => {
    for (const status of [400, 401, 403, 404, 413, 415, 422]) {
      expect(isRetryableError({ status }), String(status)).toBe(false);
    }
    expect(isRetryableError(null)).toBe(false);
  });
});

describe('TrackedRequest — stato dell\'errore per "Riprova"', () => {
  it('dopo un errore transitorio canRetry è true; un nuovo avvio lo azzera', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const first = new Subject<UploadEvent<string>>();

    req.run(first, { next: vi.fn(), error: vi.fn() });
    expect(req.canRetry()).toBe(false);
    first.error({ status: 503 });
    expect(req.failure()?.status).toBe(503);
    expect(req.canRetry()).toBe(true);

    req.run(new Subject<UploadEvent<string>>(), { next: vi.fn(), error: vi.fn() });
    expect(req.failure()).toBeNull();
    expect(req.canRetry()).toBe(false);
  });

  it('un errore non ripetibile (413) non abilita "Riprova"', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    req.run(events, { next: vi.fn(), error: vi.fn() });
    events.error({ status: 413 });
    expect(req.failure()?.status).toBe(413);
    expect(req.canRetry()).toBe(false);
  });

  it('clearFailure() e l\'annullamento da parte dell\'utente nascondono "Riprova"', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    req.run(events, { next: vi.fn(), error: vi.fn() });
    events.error({ status: 0 });
    expect(req.canRetry()).toBe(true);
    req.clearFailure();
    expect(req.canRetry()).toBe(false);

    const again = new Subject<UploadEvent<string>>();
    req.run(again, { next: vi.fn(), error: vi.fn() });
    expect(req.cancel()).toBe(true);
    expect(req.failure()).toBeNull();
  });

  it('non è ripetibile mentre una richiesta è ancora attiva', () => {
    const { ref } = fakeDestroyRef();
    const req = new TrackedRequest(ref);
    const events = new Subject<UploadEvent<string>>();
    req.run(events, { next: vi.fn(), error: vi.fn() });
    req.failure.set({ status: 500 });
    expect(req.canRetry()).toBe(false);
  });
});
