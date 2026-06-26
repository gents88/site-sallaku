import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthModalService {
  readonly loginOpen = signal(false);
  readonly accountOpen = signal(false);

  openLogin(): void {
    this.accountOpen.set(false);
    this.loginOpen.set(true);
  }

  closeLogin(): void {
    this.loginOpen.set(false);
  }

  openAccount(): void {
    this.loginOpen.set(false);
    this.accountOpen.set(true);
  }

  closeAccount(): void {
    this.accountOpen.set(false);
  }

  closeAll(): void {
    this.loginOpen.set(false);
    this.accountOpen.set(false);
  }
}