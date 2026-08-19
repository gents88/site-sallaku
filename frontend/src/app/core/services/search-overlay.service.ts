import { Injectable, signal } from '@angular/core';

/** Shared open/closed state for the site-wide search overlay — lets the navbar trigger button and the overlay component (mounted at app root) stay decoupled. */
@Injectable({ providedIn: 'root' })
export class SearchOverlayService {
  readonly open = signal(false);

  toggle(): void {
    this.open.update(v => !v);
  }

  show(): void {
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
  }
}
