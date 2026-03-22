import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';
import { fromEvent, merge, Subscription, timer } from 'rxjs';
import { AuthModalService } from './auth-modal.service';
import { AuthService } from './auth.service';

const LAST_ACTIVITY_KEY = 'portfolio_last_activity';

@Injectable({ providedIn: 'root' })
export class InactivityService {
  readonly timeoutMs = 5 * 60 * 1000;
  readonly warningMs = 30 * 1000;
  readonly warningVisible = signal(false);
  readonly countdownSeconds = signal(this.warningMs / 1000);
  readonly expiresAt = signal<number | null>(null);
  readonly lastActivityAt = signal<number | null>(null);
  private readonly trackingReady = signal(false);

  private readonly auth = inject(AuthService);
  private readonly authModal = inject(AuthModalService);
  private readonly document = inject(DOCUMENT);

  private initialized = false;
  private lastBroadcastAt = 0;
  private warningTimerSub?: Subscription;
  private logoutTimerSub?: Subscription;
  private countdownSub?: Subscription;
  private readonly subscriptions = new Subscription();
  private readonly trackingEffect = effect(() => {
    if (!this.trackingReady()) {
      return;
    }

    if (this.shouldTrack()) {
      this.resumeTracking();
      return;
    }

    this.stopTracking();
  }, { allowSignalWrites: true });

  init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.bindActivityEvents();
    this.bindVisibilityEvents();
    this.bindStorageEvents();
    this.trackingReady.set(true);
  }

  stayLoggedIn(): void {
    if (!this.shouldTrack()) {
      return;
    }

    this.refreshSession(Date.now(), true);
  }

  logoutNow(): void {
    if (!this.auth.isLoggedIn()) {
      return;
    }

    this.authModal.closeAll();
    this.stopTracking({ clearSharedState: true });
    this.auth.logout('/admin/login');
  }

  private bindActivityEvents(): void {
    const activity$ = merge(
      fromEvent(this.document, 'mousemove', { passive: true }),
      fromEvent(this.document, 'click', { passive: true }),
      fromEvent(this.document, 'keydown'),
      fromEvent(window, 'scroll', { passive: true }),
    );

    this.subscriptions.add(
      activity$.subscribe(() => {
        if (!this.shouldTrack() || this.warningVisible()) {
          return;
        }

        this.refreshSession(Date.now(), true);
      }),
    );
  }

  private bindVisibilityEvents(): void {
    this.subscriptions.add(
      fromEvent(this.document, 'visibilitychange').subscribe(() => {
        if (this.document.visibilityState !== 'visible' || !this.shouldTrack()) {
          return;
        }

        this.resumeTracking();
      }),
    );
  }

  private bindStorageEvents(): void {
    this.subscriptions.add(
      fromEvent<StorageEvent>(window, 'storage').subscribe(event => {
        if (event.storageArea !== localStorage) {
          return;
        }

        if (event.key === LAST_ACTIVITY_KEY && event.newValue) {
          const sharedActivityAt = Number(event.newValue);

          if (Number.isFinite(sharedActivityAt) && sharedActivityAt > (this.lastActivityAt() ?? 0)) {
            this.refreshSession(sharedActivityAt, false);
          }
        }

        if (event.key === LAST_ACTIVITY_KEY && event.newValue === null) {
          this.stopTracking();
        }
      }),
    );
  }

  private resumeTracking(): void {
    const sharedActivityAt = this.readSharedActivity();

    if (sharedActivityAt === null) {
      this.refreshSession(Date.now(), true);
      return;
    }

    this.refreshSession(sharedActivityAt, false);
  }

  private refreshSession(activityAt: number, broadcast: boolean): void {
    if (!this.shouldTrack()) {
      return;
    }

    const expiresAt = activityAt + this.timeoutMs;
    const remainingMs = expiresAt - Date.now();

    if (remainingMs <= 0) {
      this.logoutNow();
      return;
    }

    this.lastActivityAt.set(activityAt);
    this.expiresAt.set(expiresAt);
    this.warningVisible.set(false);
    this.countdownSeconds.set(Math.ceil(this.warningMs / 1000));
    this.authModal.closeLogin();
    this.clearTimers();

    if (broadcast) {
      this.persistActivity(activityAt);
    }

    this.logoutTimerSub = timer(remainingMs).subscribe(() => this.logoutNow());

    if (remainingMs <= this.warningMs) {
      this.openWarning(expiresAt);
      return;
    }

    this.warningTimerSub = timer(remainingMs - this.warningMs).subscribe(() => this.openWarning(expiresAt));
  }

  private openWarning(expiresAt: number): void {
    if (!this.shouldTrack()) {
      return;
    }

    this.authModal.closeAll();
    this.warningVisible.set(true);
    this.expiresAt.set(expiresAt);
    this.startCountdown(expiresAt);
  }

  private startCountdown(expiresAt: number): void {
    this.countdownSub?.unsubscribe();
    this.countdownSub = timer(0, 1000).subscribe(() => {
      const secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      this.countdownSeconds.set(secondsLeft);

      if (secondsLeft === 0) {
        this.countdownSub?.unsubscribe();
      }
    });
  }

  private stopTracking(options?: { clearSharedState?: boolean }): void {
    this.clearTimers();
    this.warningVisible.set(false);
    this.expiresAt.set(null);
    this.lastActivityAt.set(null);
    this.countdownSeconds.set(Math.ceil(this.warningMs / 1000));

    if (options?.clearSharedState) {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
  }

  private clearTimers(): void {
    this.warningTimerSub?.unsubscribe();
    this.logoutTimerSub?.unsubscribe();
    this.countdownSub?.unsubscribe();
    this.warningTimerSub = undefined;
    this.logoutTimerSub = undefined;
    this.countdownSub = undefined;
  }

  private persistActivity(activityAt: number): void {
    this.lastBroadcastAt = activityAt;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(activityAt));
  }

  private readSharedActivity(): number | null {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);

    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private shouldTrack(): boolean {
    return this.auth.isLoggedIn() && this.auth.isAdmin();
  }
}