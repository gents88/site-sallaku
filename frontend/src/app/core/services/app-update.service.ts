import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { SnackbarService } from './snackbar.service';

/**
 * Without this, the Angular service worker only adopts a newly deployed
 * version on some *later* full reload (whichever one happens to land after
 * the background download finishes) — with the site's rapid-fire deploys,
 * that left visitors stuck on a stale cached shell referencing JS chunks a
 * later deploy had already overwritten, so a reload failed to load at all.
 * Reacting to VERSION_READY and reloading immediately keeps every visitor
 * on the version the server is actually serving.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbar = inject(SnackbarService);

  private initialized = false;

  init(): void {
    if (this.initialized || !this.swUpdate.isEnabled) return;
    this.initialized = true;

    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type !== 'VERSION_READY') return;
      const { currentVersion, latestVersion } = evt as VersionReadyEvent;
      if (currentVersion.hash === latestVersion.hash) return;

      this.snackbar.show('Nuova versione disponibile, aggiornamento in corso…', 'info', 2500);
      setTimeout(() => document.location.reload(), 1500);
    });

    this.swUpdate.checkForUpdate().catch(() => { /* offline or SW not controlling yet — next navigation will retry */ });
  }
}
