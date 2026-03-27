import { Injectable, signal, computed } from '@angular/core';

/**
 * Global loading state manager.
 *
 * Components increment/decrement the counter to indicate async operations.
 * The `isLoading` signal is true whenever at least one operation is pending.
 *
 * Usage:
 *   constructor(private loading: LoadingService) {}
 *
 *   fetchData() {
 *     this.loading.start('my-key');
 *     this.http.get(...).pipe(
 *       finalize(() => this.loading.stop('my-key'))
 *     ).subscribe(...);
 *   }
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _pending = signal<Set<string>>(new Set());

  /** True when any operation is in progress. */
  readonly isLoading = computed(() => this._pending().size > 0);

  /** Number of concurrent pending operations. */
  readonly pendingCount = computed(() => this._pending().size);

  /** Mark the given key as in-progress. Safe to call multiple times. */
  start(key = 'default'): void {
    this._pending.update(s => new Set(s).add(key));
  }

  /** Mark the given key as complete. Noop if the key was never started. */
  stop(key = 'default'): void {
    this._pending.update(s => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  }

  /** Check if a specific key is currently loading. */
  isKeyLoading(key: string): boolean {
    return this._pending().has(key);
  }

  /** Reset all pending operations (e.g. on navigation). */
  clear(): void {
    this._pending.set(new Set());
  }
}
