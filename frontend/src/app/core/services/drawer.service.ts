import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DrawerService {
  readonly drawerOpen = signal(true);

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
