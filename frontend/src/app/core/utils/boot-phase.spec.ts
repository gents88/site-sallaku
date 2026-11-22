import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_CLASS, documentLoaded, endBootPhaseWhenReady } from './boot-phase';

/** requestAnimationFrame finto: i frame avanzano solo quando lo chiede il test. */
function manualFrames() {
  const queue: (() => void)[] = [];
  return {
    raf: (cb: () => void) => { queue.push(cb); },
    flush: () => { const pending = queue.splice(0); pending.forEach(cb => cb()); },
  };
}

describe('endBootPhaseWhenReady', () => {
  beforeEach(() => document.documentElement.classList.add(BOOT_CLASS));
  afterEach(() => {
    document.documentElement.classList.remove(BOOT_CLASS);
    vi.useRealTimers();
  });

  it('toglie la classe solo dopo che tutto è pronto e dopo due frame', async () => {
    const frames = manualFrames();
    let markReady!: () => void;
    const ready = new Promise<void>(r => { markReady = r; });

    const done = endBootPhaseWhenReady(document, [ready, Promise.resolve()], { raf: frames.raf });
    await Promise.resolve();
    frames.flush();
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(true);

    markReady();
    await new Promise(r => setTimeout(r, 0));
    frames.flush();
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(true);
    frames.flush();
    await done;
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(false);
  });

  it('riattiva le transizioni anche se una delle attese fallisce', async () => {
    const frames = manualFrames();
    const done = endBootPhaseWhenReady(document, [Promise.reject(new Error('rete'))], { raf: frames.raf });
    await new Promise(r => setTimeout(r, 0));
    frames.flush();
    frames.flush();
    await done;
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(false);
  });

  it('riattiva le transizioni dopo il tempo massimo se l\'app non diventa mai stabile', async () => {
    vi.useFakeTimers();
    const frames = manualFrames();
    const done = endBootPhaseWhenReady(document, [new Promise(() => {})], { raf: frames.raf, maxMs: 8000 });

    await vi.advanceTimersByTimeAsync(7999);
    frames.flush();
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    frames.flush();
    frames.flush();
    await done;
    expect(document.documentElement.classList.contains(BOOT_CLASS)).toBe(false);
  });
});

describe('documentLoaded', () => {
  it('si risolve subito se il documento ha già finito di caricare', async () => {
    const doc = { readyState: 'complete', defaultView: window } as unknown as Document;
    await expect(documentLoaded(doc)).resolves.toBeUndefined();
  });

  it('aspetta l\'evento load se il documento sta ancora caricando', async () => {
    const target = new EventTarget();
    const doc = { readyState: 'loading', defaultView: target } as unknown as Document;
    let resolved = false;
    void documentLoaded(doc).then(() => { resolved = true; });

    await Promise.resolve();
    expect(resolved).toBe(false);
    target.dispatchEvent(new Event('load'));
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});
