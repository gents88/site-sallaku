import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Stato della connessione del browser (sempre "online" in prerender). */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly _online = signal(true);
  readonly online = this._online.asReadonly();

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this._online.set(navigator.onLine !== false);
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));
  }
}
