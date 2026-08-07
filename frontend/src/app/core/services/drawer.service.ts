import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DrawerService {
  readonly drawerOpen = signal(false);

  toggle(): void {
    this.drawerOpen.update(v => !v);
  }

  close(): void {
    this.drawerOpen.set(false);
  }

  open(): void {
    this.drawerOpen.set(true);
  }
}
